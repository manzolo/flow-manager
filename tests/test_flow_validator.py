import pytest

from utils.flow_validator import FlowValidator


def valid_flow():
    return {
        "start_node": "start",
        "nodes": {
            "start": {
                "type": "question",
                "text": "Continue?",
                "answers": [
                    {"label": "Yes", "next": "yes_output"},
                    {"label": "No", "next": "no_output"},
                ],
            },
            "yes_output": {
                "type": "output",
                "title": "Yes",
                "content": "Positive result.",
            },
            "no_output": {
                "type": "output",
                "title": "No",
                "content": "Negative result.",
            },
        },
    }


def validate(flow):
    return FlowValidator().validate(flow)


def test_valid_flow_passes_validation():
    is_valid, errors = validate(valid_flow())

    assert is_valid is True
    assert errors == []


def test_missing_start_node_fails_validation():
    flow = valid_flow()
    del flow["start_node"]

    is_valid, errors = validate(flow)

    assert is_valid is False
    assert "Missing 'start_node' field" in errors


def test_question_answer_with_broken_next_reference_fails_validation():
    flow = valid_flow()
    flow["nodes"]["start"]["answers"][0]["next"] = "missing_node"

    is_valid, errors = validate(flow)

    assert is_valid is False
    assert (
        "Node 'start': answer 0 references non-existent node 'missing_node'"
        in errors
    )


@pytest.mark.parametrize(
    ("version", "expected_error"),
    [
        ("1.0", "Invalid version format: 1.0. Use semantic versioning (e.g., 1.0.0)"),
        ("v1.0.0", "Invalid version format: v1.0.0. Use semantic versioning (e.g., 1.0.0)"),
    ],
)
def test_metadata_version_must_use_semver(version, expected_error):
    errors = FlowValidator().validate_metadata(
        {
            "name": "Example",
            "description": "Example flow",
            "category": "Demo",
            "version": version,
        }
    )

    assert expected_error in errors
