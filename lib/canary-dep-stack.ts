import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';

export class CanaryDepStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create SQS Queue
    const mainQueue = new sqs.Queue(this, 'MainQueue');

    // Processing Lambda (versioning handled in GitHub workflow)
    const processingLambda = new lambda.Function(this, 'ProcessingLambda', {
      runtime: lambda.Runtime.PYTHON_3_11,
      code: lambda.Code.fromAsset('lambda/processing'),
      handler: 'index.lambda_handler',
    });

    // Routing Lambda
    const routingLambda = new lambda.Function(this, 'RoutingLambda', {
      runtime: lambda.Runtime.PYTHON_3_11,
      code: lambda.Code.fromAsset('lambda/routing'),
      handler: 'index.lambda_handler',
      environment: {
        STABLE_ALIAS_ARN: '', // Will be filled by GitHub workflow
        CANARY_ALIAS_ARN: '', // Will be filled by GitHub workflow
        CANARY_PERCENT: '0',  // Default to 0 until GitHub sets it
      },
    });

    // Permissions
    mainQueue.grantConsumeMessages(routingLambda);
    processingLambda.grantInvoke(routingLambda); // Allow invoke for all versions

    // SQS trigger to Routing Lambda
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