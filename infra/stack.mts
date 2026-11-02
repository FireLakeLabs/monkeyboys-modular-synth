import { Annotations, App, CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { bootstrapRoles, hosting } from './config.mts'

export function createHostingStack(app: App): Stack {
  const stack = new Stack(app, hosting.stackName, {
    env: { account: hosting.account, region: hosting.region },
    terminationProtection: true,
    description: 'Public static MonkeyBoy modular synth; owned by its application repository.',
  })
  const bucketProps = {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    removalPolicy: RemovalPolicy.RETAIN,
  }
  // Hashed chunks are retained indefinitely. Cleanup is a separate reviewed operation.
  const website = new s3.Bucket(stack, 'Website', bucketProps)
  const releases = new s3.Bucket(stack, 'Releases', bucketProps)
  // CDK's concrete Bucket has an optional-property type mismatch with IBucket.
  // Import its name for the origin adapter and attach the OAC grant to the owned bucket below.
  const originBucket = s3.Bucket.fromBucketName(stack, 'OriginBucket', website.bucketName)
  const origin = origins.S3BucketOrigin.withOriginAccessControl(originBucket)
  const distribution = new cloudfront.Distribution(stack, 'Distribution', {
    defaultRootObject: 'index.html',
    domainNames: [hosting.hostname],
    certificate: acm.Certificate.fromCertificateArn(stack, 'Certificate', hosting.certificateArn),
    minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    defaultBehavior: {
      origin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      compress: true,
    },
    additionalBehaviors: {
      'assets/*': {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
    },
    // Missing chunks must stay errors, rather than masquerading as HTML.
    errorResponses: [403, 404].map((httpStatus) => ({ httpStatus, ttl: Duration.seconds(0) })),
  })
  website.addToResourcePolicy(
    new iam.PolicyStatement({
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [website.arnForObjects('*')],
      conditions: { StringEquals: { 'AWS:SourceArn': distribution.distributionArn } },
    }),
  )
  Annotations.of(distribution).acknowledgeWarning(
    '@aws-cdk/aws-cloudfront-origins:updateImportedBucketPolicyOac',
    'The distribution-scoped GetObject grant is attached to the owned website bucket above.',
  )
  const zone = route53.HostedZone.fromHostedZoneAttributes(stack, 'Zone', {
    hostedZoneId: hosting.zoneId,
    zoneName: 'firelakelabs.com',
  })
  for (const Record of [route53.ARecord, route53.AaaaRecord]) {
    new Record(stack, Record === route53.ARecord ? 'AliasA' : 'AliasAAAA', {
      zone,
      recordName: 'mms',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    })
  }
  const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
    stack,
    'GitHubProvider',
    `arn:aws:iam::${hosting.account}:oidc-provider/token.actions.githubusercontent.com`,
  )
  function githubRole(id: string, environment: string): iam.Role {
    return new iam.Role(stack, id, {
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${hosting.repository}:environment:${environment}`,
        },
      }),
      maxSessionDuration: Duration.hours(1),
    })
  }
  const deploy = githubRole('AppDeployRole', 'production')
  for (const bucket of [website, releases]) {
    deploy.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket', 's3:GetBucketLocation'],
        resources: [bucket.bucketArn],
      }),
    )
    deploy.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [bucket.arnForObjects('*')],
      }),
    )
  }
  deploy.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        'cloudfront:GetDistribution',
        'cloudfront:CreateInvalidation',
        'cloudfront:GetInvalidation',
      ],
      resources: [distribution.distributionArn],
    }),
  )
  const stackArn = `arn:aws:cloudformation:${hosting.region}:${hosting.account}:stack/${hosting.stackName}/*`
  deploy.addToPolicy(
    new iam.PolicyStatement({
      actions: ['cloudformation:DescribeStacks'],
      resources: [stackArn],
    }),
  )
  const infra = githubRole('InfraDeployRole', 'infrastructure')
  infra.addToPolicy(
    new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: bootstrapRoles,
    }),
  )
  infra.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackEvents',
        'cloudformation:GetTemplate',
      ],
      resources: [
        stackArn,
        `arn:aws:cloudformation:${hosting.region}:${hosting.account}:stack/CDKToolkit/*`,
      ],
    }),
  )
  for (const [key, value] of Object.entries({
    WebsiteBucketName: website.bucketName,
    ReleasesBucketName: releases.bucketName,
    DistributionId: distribution.distributionId,
    WebsiteUrl: `https://${hosting.hostname}`,
    AppDeployRoleArn: deploy.roleArn,
    InfraDeployRoleArn: infra.roleArn,
  }))
    new CfnOutput(stack, key, { value })
  return stack
}
