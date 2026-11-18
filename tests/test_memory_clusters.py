import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from memory_clusters import cluster_memory

class ClusterTests(unittest.TestCase):
    def test_only_accepted_related_edges_join(self):
        nodes=[{"id":i,"content":str(i)} for i in range(1,6)]
        links=[
            {"source_id":1,"target_id":2,"status":"accepted","relation":"related"},
            {"source_id":2,"target_id":3,"status":"accepted","relation":"related"},
            {"source_id":3,"target_id":4,"status":"suggested","relation":"related"},
            {"source_id":4,"target_id":5,"status":"accepted","relation":"possible_conflict"},
        ]
        clusters,updated=cluster_memory(nodes,links)
        self.assertEqual(clusters,[{"id":1,"members":[1,2,3],"size":3}])
        self.assertEqual([n["cluster_id"] for n in updated],[1,1,1,None,None])
    def test_stable_independent_of_order(self):
        nodes=[{"id":i} for i in (9,2,5)]
        links=[{"source_id":9,"target_id":5,"status":"accepted","relation":"related"}]
        clusters,_=cluster_memory(nodes,links)
        self.assertEqual(clusters[0]["id"],5)
        self.assertEqual(clusters[0]["members"],[5,9])
