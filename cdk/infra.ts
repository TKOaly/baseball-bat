import * as cdk from '@aws-cdk/core'
import * as lambda from '@aws-cdk/aws-lambda'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as agw from '@aws-cdk/aws-apigateway'

const SUBNET_CIDRS = ['10.120.204.0/23', '10.120.206.0/23']

const createStack = (app: cdk.App) => {
  const stack = new cdk.Stack(app, 'BaseballBat', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: 'eu-west-1',
    },
  })

  const tkoAlyVpc = ec2.Vpc.fromLookup(stack, 'TkoAlyVpc', {
    vpcId: process.env.TEKIS_VPC_ID,
  })

  const postgresSg = ec2.SecurityGroup.fromLookupByName(
    stack,
    'PostgresSg',
    'postgres-security-group',
    tkoAlyVpc
  )

  const privateSubnets = tkoAlyVpc.privateSubnets.filter(snet =>
    SUBNET_CIDRS.includes(snet.ipv4CidrBlock)
  )

  console.info(
    'Found subnets',
    privateSubnets.map(snet => snet.subnetId)
  )

  const service = new lambda.DockerImageFunction(stack, 'BaseballBatLambda', {
    code: lambda.DockerImageCode.fromImageAsset('.'),
    functionName: 'basballbat-service',
    vpc: tkoAlyVpc,
    vpcSubnets: {
      subnets: privateSubnets,
    },
  })

  service.connections.allowTo(postgresSg, ec2.Port.tcp(5432))

  const apiGateway = new agw.RestApi(stack, 'BaseballBatApiGw')
  const integration = new agw.LambdaIntegration(service)
  const wildcardRoute = apiGateway.root
    .addResource('{proxy+}')
    .addMethod('ANY', integration)
}

const app = new cdk.App()
createStack(app)
