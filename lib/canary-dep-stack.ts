import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';

export class CanaryDepStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Create the SQS queue
    const mainQueue = new sqs.Queue(this, 'MainQueue',{
      queueName: 'MainQueue',
      visibilityTimeout: cdk.Duration.seconds(30)
    });

    // 2. Processing Lambda Function
    const processingLambda = new lambda.Function(this, 'ProcessingLambda', {
      runtime: lambda.Runtime.PYTHON_3_13,
      code: lambda.Code.fromAsset('lambda/processing'),
      handler: 'index.handler',
      functionName: 'ProcessingLambda',
    });

    // 3. Publish a version
    const version = processingLambda.currentVersion;

    // 4. Create Aliases
    const stableAlias = new lambda.Alias(this, 'StableAlias', {
      aliasName: 'stable',
      version: version,
    });

    const canaryAlias = new lambda.Alias(this, 'CanaryAlias', {
      aliasName: 'canary',
      version: version, // Update manually later for new versions
    });

    // 5. Routing Lambda Function
    const routingLambda = new lambda.Function(this, 'RoutingLambda', {
      runtime: lambda.Runtime.PYTHON_3_13,
      code: lambda.Code.fromAsset('lambda/routing'),
      handler: 'index.handler',
      functionName: 'RoutingLambda',
      environment: {
        STABLE_ALIAS_ARN: stableAlias.functionArn,
        CANARY_ALIAS_ARN: canaryAlias.functionArn,
        CANARY_PERCENT: '10',
      },
    });

    // 6. Grant permissions
    mainQueue.grantConsumeMessages(routingLambda);
    stableAlias.grantInvoke(routingLambda);
    canaryAlias.grantInvoke(routingLambda);

    // 7. Add mainQueue as event source
    routingLambda.addEventSource(new lambdaEventSources.SqsEventSource(mainQueue));

    mainQueue.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sqs:SendMessage'],
      principals: [new iam.AnyPrincipal()],
      resources: [mainQueue.queueArn],
      conditions: {
        ArnEquals: {
          'aws:SourceArn': 'arn:aws:sns:ap-south-1:471112655072:cross-account-topic'
        }
      }
    }));
  }
}