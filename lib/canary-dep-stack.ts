import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';

export class CanaryDepStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const mainQueue = new sqs.Queue(this, 'MainQueue',{
      queueName: 'MainQueue',
      visibilityTimeout: cdk.Duration.seconds(30),
    });

    // Processing Lambda (versioning handled in GitHub workflow)
    const processingLambda = new lambda.Function(this, 'ProcessingLambda', {
      functionName: 'ProcessingLambda',
      runtime: lambda.Runtime.PYTHON_3_11,
      code: lambda.Code.fromAsset('lambda/processing'),
      handler: 'index.handler',
    });

    // Routing Lambda
    const routingLambda = new lambda.Function(this, 'RoutingLambda', {
      functionName: 'RoutingLambda',
      runtime: lambda.Runtime.PYTHON_3_11,
      code: lambda.Code.fromAsset('lambda/routing'),
      handler: 'index.handler',
      environment: {
        STABLE_ALIAS_ARN: '', 
        CANARY_ALIAS_ARN: '', 
        CANARY_PERCENT: '0', 
      },
    });


    mainQueue.grantConsumeMessages(routingLambda);
    processingLambda.grantInvoke(routingLambda); 

  
    routingLambda.addEventSource(new lambdaEventSources.SqsEventSource(mainQueue,{
      batchSize:1
    }));

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