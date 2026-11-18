"""Stable connected-component grouping of accepted memory relations.

Suggested relations remain visible as edges, but cannot automatically merge clusters.
"""
def cluster_memory(nodes,links):
    ids={node["id"] for node in nodes}
    parent={i:i for i in ids}
    def root(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]]
            i=parent[i]
        return i
    def union(a,b):
        ra,rb=root(a),root(b)
        if ra!=rb:
            parent[max(ra,rb)]=min(ra,rb)
    for link in links:
        if (link["source_id"] in ids and link["target_id"] in ids
                and link["status"]=="accepted" and link["relation"]=="related"):
            union(link["source_id"],link["target_id"])
    groups={}
    for node in nodes:
        groups.setdefault(root(node["id"]),[]).append(node["id"])
    clusters=[]
    for group_id,members in sorted(groups.items(),key=lambda p:p[0]):
        if len(members)>1:
            clusters.append({"id":group_id,"members":sorted(members),"size":len(members)})
    membership={mid:cluster["id"] for cluster in clusters for mid in cluster["members"]}
    return clusters,[{**node,"cluster_id":membership.get(node["id"])} for node in nodes]
