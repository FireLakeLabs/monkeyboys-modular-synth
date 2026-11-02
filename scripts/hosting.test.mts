import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { hosting } from '../infra/config.mts'
import { createHostingStack } from '../infra/stack.mts'
import { createManifest, parseManifest, publish, resolveTargets, restore } from './hosting.mts'
import type { Aws } from './hosting.mts'

function service() {
  const objects = new Map<string, Buffer>()
  const writes: string[] = []
  const distribution = {
    Enabled: true,
    Aliases: { Items: [hosting.hostname] },
    Origins: {
      Items: [
        {
          Id: 'origin',
          DomainName: 'mms-website.s3.us-east-1.amazonaws.com',
          OriginAccessControlId: 'oac',
        },
      ],
    },
    DefaultCacheBehavior: { TargetOriginId: 'origin', ViewerProtocolPolicy: 'redirect-to-https' },
  }
  const run: Aws = (args) => {
    const operation = args.slice(0, 2).join(' ')
    if (operation === 'sts get-caller-identity') return { Account: hosting.account }
    if (operation === 'cloudformation describe-stacks')
      return {
        Stacks: [
          {
            StackId: `arn:aws:cloudformation:us-east-1:${hosting.account}:stack/${hosting.stackName}/test`,
            Outputs: Object.entries({
              WebsiteBucketName: 'mms-website',
              ReleasesBucketName: 'mms-releases',
              DistributionId: 'E123',
              WebsiteUrl: `https://${hosting.hostname}`,
            }).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue })),
          },
        ],
      }
    if (operation === 'cloudfront get-distribution')
      return { Distribution: { DistributionConfig: distribution } }
    if (operation === 's3api list-objects-v2') {
      const prefix = `s3://${args[3]}/${args[5]}`
      return { KeyCount: Number([...objects.keys()].some((key) => key.startsWith(prefix))) }
    }
    if (operation === 's3 cp') {
      const source = args[2]
      const target = args[3]
      assert.ok(source && target)
      if (source.startsWith('s3://')) {
        const data = objects.get(source)
        assert.ok(data, `Missing archived object ${source}`)
        writeFileSync(target, data)
      } else {
        objects.set(target, readFileSync(source))
        writes.push(target)
      }
      return null
    }
    if (operation === 'cloudfront create-invalidation') return { Invalidation: { Id: 'I123' } }
    if (operation === 'cloudfront wait') return null
    throw new Error(`Unexpected AWS operation ${operation}`)
  }
  return { run, objects, writes, distribution }
}

await test('hosting template keeps S3 private, uses OAC/HTTPS, and separates app and infrastructure trust', () => {
  const template = Template.fromStack(createHostingStack(new App()))
  template.resourceCountIs('AWS::S3::Bucket', 2)
  template.allResourcesProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
  })
  template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: Match.objectLike({
      SigningBehavior: 'always',
      SigningProtocol: 'sigv4',
    }),
  })
  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({
          Principal: { Service: 'cloudfront.amazonaws.com' },
          Action: 's3:GetObject',
          Condition: { StringEquals: { 'AWS:SourceArn': Match.anyValue() } },
        }),
      ]),
    }),
  })
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultCacheBehavior: Match.objectLike({
        ViewerProtocolPolicy: 'redirect-to-https',
        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
      }),
      CacheBehaviors: Match.arrayWith([
        Match.objectLike({
          PathPattern: 'assets/*',
          CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        }),
      ]),
    }),
  })
  for (const environment of ['production', 'infrastructure'])
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                // Captured from GitHub's OIDC settings API and failed CloudTrail exchanges.
                'token.actions.githubusercontent.com:sub': `repo:FireLakeLabs@267435624/monkeyboys-modular-synth@1442162225:environment:${environment}`,
              },
            },
          }),
        ],
        Version: '2012-10-17',
      },
    })
})

await test('target mismatch is rejected before publishing to the wrong bucket', () => {
  const aws = service()
  aws.distribution.Origins.Items[0] = {
    Id: 'origin',
    DomainName: 'other.s3.us-east-1.amazonaws.com',
    OriginAccessControlId: 'oac',
  }
  assert.throws(() => resolveTargets(aws.run), /origin/)
})

await test('publishes assets before HTML, retains old chunks, and restores the archived bytes', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'mms-test-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(join(directory, 'assets'))
  writeFileSync(join(directory, 'index.html'), '<html>release A</html>')
  writeFileSync(join(directory, 'assets/engine-old.js'), 'old engine')
  const aws = service()
  const liveBodies: string[] = []
  context.mock.method(globalThis, 'fetch', () => {
    const body = aws.objects.get('s3://mms-website/index.html')
    assert.ok(body)
    liveBodies.push(body.toString())
    return Promise.resolve(new Response(body))
  })
  const a = await createManifest(directory, 'release-a')
  await publish({ run: aws.run, directory, manifest: a, archive: true })
  assert.deepEqual(
    aws.writes.filter((path) => path.startsWith('s3://mms-website')),
    ['s3://mms-website/assets/engine-old.js', 's3://mms-website/index.html'],
  )
  rmSync(join(directory, 'assets/engine-old.js'))
  writeFileSync(join(directory, 'assets/engine-new.js'), 'new engine')
  writeFileSync(join(directory, 'index.html'), '<html>release B</html>')
  const b = await createManifest(directory, 'release-b')
  await publish({
    run: aws.run,
    directory,
    manifest: b,
    archive: true,
  })
  assert.equal(aws.objects.get('s3://mms-website/assets/engine-old.js')?.toString(), 'old engine')
  await restore(aws.run, 'release-a')
  assert.equal(aws.objects.get('s3://mms-website/index.html')?.toString(), '<html>release A</html>')
  assert.deepEqual(liveBodies, [
    '<html>release A</html>',
    '<html>release B</html>',
    '<html>release A</html>',
  ])
  await assert.rejects(
    publish({
      run: aws.run,
      directory,
      manifest: await createManifest(directory, 'release-a'),
      archive: true,
    }),
    /already exists/,
  )
  writeFileSync(join(directory, 'index.html'), 'tampered')
  const writesBefore = aws.writes.length
  await assert.rejects(
    publish({ run: aws.run, directory, manifest: b, archive: false }),
    /checksum/,
  )
  assert.equal(aws.writes.length, writesBefore)
})

await test('rollback rejects path traversal and a release other than the selected one', () => {
  assert.throws(
    () =>
      parseManifest(
        { version: 1, release: 'a', files: [{ path: '../index.html', sha256: '0'.repeat(64) }] },
        'a',
      ),
    /Invalid release file/,
  )
  assert.throws(
    () => parseManifest({ version: 1, release: 'b', files: [] }, 'a'),
    /Unexpected release manifest/,
  )
})
