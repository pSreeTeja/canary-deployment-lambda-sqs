import os
import json
import random
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')

STABLE_ALIAS_ARN = os.environ['STABLE_ALIAS_ARN']
CANARY_ALIAS_ARN = os.environ['CANARY_ALIAS_ARN']
CANARY_PERCENT = int(os.environ.get('CANARY_PERCENT', '0'))  # 0 to 100


def handler(event, context):
    for record in event['Records']:
        target_arn = CANARY_ALIAS_ARN if random.random() * 100 < CANARY_PERCENT else STABLE_ALIAS_ARN

        try:
            response = lambda_client.invoke(
                FunctionName=target_arn,
                InvocationType='Event',  # async
                Payload=json.dumps(record)
            )
            logger.info(f"Invoked {target_arn}, StatusCode: {response['StatusCode']}")
        except Exception as e:
            logger.error(f"Error invoking {target_arn}: {str(e)}")

    return {
        'statusCode': 200,
        'body': json.dumps('Routing completed')
    }
