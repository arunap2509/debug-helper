import requests
import boto3

SSM_GET_PARAMETERS_LIMIT = 10


def _session(cfg):
    return boto3.Session(
        aws_access_key_id=cfg.get("access_key", "test"),
        aws_secret_access_key=cfg.get("secret_key", "test"),
        region_name=cfg.get("region", "us-east-1"),
    )


def _endpoint(cfg):
    return f"http://{cfg['host']}:{cfg['port']}"


def ping(cfg):
    resp = requests.get(f"{_endpoint(cfg)}/_localstack/health", timeout=3)
    resp.raise_for_status()


def send_message(cfg, queue_name: str, body: str):
    sqs = _session(cfg).client("sqs", endpoint_url=_endpoint(cfg))
    queue_url = sqs.get_queue_url(QueueName=queue_name)["QueueUrl"]
    resp = sqs.send_message(QueueUrl=queue_url, MessageBody=body)
    return {"messageId": resp["MessageId"]}


def purge_queue(cfg, queue_name: str):
    sqs = _session(cfg).client("sqs", endpoint_url=_endpoint(cfg))
    queue_url = sqs.get_queue_url(QueueName=queue_name)["QueueUrl"]
    sqs.purge_queue(QueueUrl=queue_url)


def list_queues(cfg):
    sqs = _session(cfg).client("sqs", endpoint_url=_endpoint(cfg))
    urls = sqs.list_queues().get("QueueUrls", [])

    result = []
    for url in urls:
        name = url.rstrip("/").split("/")[-1]
        attrs = sqs.get_queue_attributes(
            QueueUrl=url,
            AttributeNames=[
                "ApproximateNumberOfMessages",
                "ApproximateNumberOfMessagesNotVisible",
                "RedrivePolicy",
            ],
        )["Attributes"]
        result.append(
            {
                "name": name,
                "url": url,
                "visible": int(attrs.get("ApproximateNumberOfMessages", 0)),
                "inFlight": int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0)),
                "hasRedrivePolicy": "RedrivePolicy" in attrs,
            }
        )
    result.sort(key=lambda q: q["name"])
    return result


def list_buckets(cfg):
    s3 = _session(cfg).client("s3", endpoint_url=_endpoint(cfg))
    buckets = s3.list_buckets().get("Buckets", [])

    result = []
    for b in buckets:
        name = b["Name"]
        objects = s3.list_objects_v2(Bucket=name, MaxKeys=50).get("Contents", [])
        result.append(
            {
                "name": name,
                "createdAt": b["CreationDate"],
                "objects": [
                    {"key": o["Key"], "sizeBytes": o["Size"], "lastModified": o["LastModified"]}
                    for o in objects
                ],
            }
        )
    result.sort(key=lambda b: b["name"])
    return result


def list_ssm_params(cfg):
    ssm = _session(cfg).client("ssm", endpoint_url=_endpoint(cfg))
    paginator = ssm.get_paginator("describe_parameters")
    names = []
    for page in paginator.paginate():
        names.extend(p["Name"] for p in page["Parameters"])
    names.sort()

    if not names:
        return []

    values = []
    for start in range(0, len(names), SSM_GET_PARAMETERS_LIMIT):
        chunk = names[start : start + SSM_GET_PARAMETERS_LIMIT]
        values.extend(ssm.get_parameters(Names=chunk, WithDecryption=True)["Parameters"])
    by_name = {v["Name"]: v for v in values}
    return [
        {"name": n, "value": by_name[n]["Value"], "type": by_name[n]["Type"]}
        for n in names
        if n in by_name
    ]


def create_queue(cfg, queue_name: str):
    sqs = _session(cfg).client("sqs", endpoint_url=_endpoint(cfg))
    resp = sqs.create_queue(QueueName=queue_name)
    return {"name": queue_name, "url": resp.get("QueueUrl")}


def create_bucket(cfg, bucket_name: str):
    s3 = _session(cfg).client("s3", endpoint_url=_endpoint(cfg))
    region = cfg.get("region", "us-east-1")
    if region == "us-east-1":
        s3.create_bucket(Bucket=bucket_name)
    else:
        s3.create_bucket(
            Bucket=bucket_name,
            CreateBucketConfiguration={"LocationConstraint": region},
        )
    return {"name": bucket_name}


def create_ssm_param(cfg, name: str, value: str, param_type: str = "String"):
    ssm = _session(cfg).client("ssm", endpoint_url=_endpoint(cfg))
    ssm.put_parameter(Name=name, Value=value, Type=param_type, Overwrite=True)
    return {"name": name, "value": value, "type": param_type}
