from evals.mocks.fixture_db import fixture_db

def test_robot7_joints():
    j = fixture_db.get_joints(7)
    assert len(j) == 6
    assert j[0].name == "j1_shoulder"
    assert j[0].effort_limit == 47.3

def test_null_link_preserved():
    links = fixture_db.get_links(7)
    link2 = next(l for l in links if l.name == "link_2")
    assert link2.mass is None

def test_robot3_exists():
    assert fixture_db.robot_exists(3)

def test_nonexistent_robot():
    assert not fixture_db.robot_exists(999)
    assert fixture_db.get_joints(999) == []
