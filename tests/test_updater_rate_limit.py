import datetime
from backend.updater.rate_limit import parse_rate_limit_retry_after


def test_parse_rate_limit_retry_after():
    now = datetime.datetime(2025, 1, 1, 12, 0, 0, tzinfo=datetime.timezone.utc)

    # Missing headers
    assert parse_rate_limit_retry_after({}, now) == "2025-01-01T12:01:00+00:00"

    # retry-after in seconds
    assert parse_rate_limit_retry_after({"retry-after": "120"}, now) == "2025-01-01T12:02:00+00:00"

    # x-ratelimit-reset epoch
    epoch = int(now.timestamp()) + 300
    assert (
        parse_rate_limit_retry_after({"x-ratelimit-reset": str(epoch)}, now)
        == "2025-01-01T12:05:00+00:00"
    )

    # Invalid headers fallback
    assert (
        parse_rate_limit_retry_after({"retry-after": "invalid"}, now) == "2025-01-01T12:01:00+00:00"
    )
    assert (
        parse_rate_limit_retry_after({"x-ratelimit-reset": "invalid"}, now)
        == "2025-01-01T12:01:00+00:00"
    )
