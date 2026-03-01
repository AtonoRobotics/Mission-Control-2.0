import pytest
from backend.core.enforcement import enforce_before_dispatch, enforce_after_output, EnforcementLevel
from backend.integrity.intent_verifier import TaskIntent

def make_intent(**kw):
    d = dict(task_id="t1", task_description="test", expected_output_type="urdf",
             expected_agent="urdf_build", robot_id=7,
             expected_joint_count_min=6, expected_joint_count_max=9)
    d.update(kw); return TaskIntent(**d)

def make_output(**kw):
    base = dict(status="ok", agent="urdf_build", task_id="t1", output_type="urdf",
               spec_version="3.0.0", guardrails_version="1.0.0",
               empirical_db_schema_version="3.1.0", generated_at="2026-03-01T00:00:00Z",
               robot_id=7, joint_count=6, output={"urdf_xml":"<robot/>"},
               null_fields=[], confidence_scores={}, errors=[], warnings=[])
    base.update(kw); return base

CORE_MODULES = ["modules/core/never_do","modules/core/null_policy","modules/core/output_schema"]

def test_missing_task_id_blocks():
    r = enforce_before_dispatch("urdf_build", make_intent(task_id=""), 1000, CORE_MODULES)
    assert not r.passed

def test_valid_dispatch_passes():
    r = enforce_before_dispatch("urdf_build", make_intent(), 1000, CORE_MODULES + ["agents/urdf_build/role"])
    assert r.passed

def test_placeholder_blocks():
    out = make_output()
    out["output"]["joint_names"] = ["your_robot_joint_1"]
    r = enforce_after_output("urdf_build", out, make_intent())
    assert not r.passed

def test_invalid_confidence_blocks():
    out = make_output(confidence_scores={"j1_effort": {"score": 0.6, "source": "est"}})
    r = enforce_after_output("urdf_build", out, make_intent())
    assert not r.passed

def test_valid_output_passes():
    r = enforce_after_output("urdf_build", make_output(), make_intent())
    assert r.passed

def test_over_budget_blocks():
    r = enforce_before_dispatch("validator", make_intent(), 999999, CORE_MODULES)
    assert not r.passed
