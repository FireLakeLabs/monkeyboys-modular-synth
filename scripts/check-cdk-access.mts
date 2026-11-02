import { aws } from './hosting.mts'
import { bootstrapRoles } from '../infra/config.mts'

// Discard returned credentials: output only the role ARN, never the session keys.
for (const arn of bootstrapRoles) {
  aws([
    'sts',
    'assume-role',
    '--role-arn',
    arn,
    '--role-session-name',
    'mms-bootstrap-preflight',
    '--query',
    'AssumedRoleUser.Arn',
  ])
  process.stdout.write(`Verified assumption of ${arn}\n`)
}
