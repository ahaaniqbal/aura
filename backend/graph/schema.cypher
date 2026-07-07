// ============================================================================
// Aura relationship graph — Neo4j property-graph model (HackwithBay 3.0)
// ============================================================================
// The core product is relationships, not rows. Aura models everyone you meet
// and every promise you make as a graph, and the agent reasons over it with
// Cypher traversals a SQL join cannot express.
//
// Multi-tenant: a shared Aura instance holds every user's graph. Every node
// carries `uid` (the Butterbase auth user id) and hangs off a :User anchor,
// so a query scoped by $uid can only ever touch that user's subgraph.
//
//   NODES
//     (:User   {id})                          the account (anchor)
//     (:Person {uid, name, note, how_met, org, created_at, updated_at})
//     (:Promise{uid, text, direction, due, status, created_at, closed_at})
//     (:Topic  {uid, name})                   an interest / expertise area
//
//   RELATIONSHIPS
//     (User)-[:KNOWS]->(Person)               your circle
//     (User)-[:MADE]->(Promise)               a commitment you hold
//     (Promise)-[:TO]->(Person)               who it's owed to / by
//     (Person)-[:INTERESTED_IN]->(Topic)      what they care about
//
//   direction on Promise: 'i_owe' | 'owed_to_me'
//   status    on Promise: 'open'  | 'done'
// ----------------------------------------------------------------------------

// --- schema (run once, op:"init") ---
CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE INDEX person_uid_name IF NOT EXISTS FOR (p:Person) ON (p.uid, p.name);
CREATE INDEX topic_uid_name  IF NOT EXISTS FOR (t:Topic)  ON (t.uid, t.name);
CREATE INDEX promise_uid     IF NOT EXISTS FOR (pr:Promise) ON (pr.uid);

// ============================================================================
// The agent's graph reasoning (examples the LLM tools compile to)
// ============================================================================

// "who do I know that's into film photography?"  (traversal, not keyword scan)
// MATCH (u:User {id:$uid})-[:KNOWS]->(p:Person)-[:INTERESTED_IN]->(t:Topic)
// WHERE toLower(t.name) CONTAINS 'film'
// RETURN p.name, collect(t.name) AS interests;

// "what am I overdue on, and to whom?"
// MATCH (u:User {id:$uid})-[:MADE]->(pr:Promise)-[:TO]->(person:Person)
// WHERE pr.status = 'open'
// RETURN pr.text, person.name, pr.due ORDER BY pr.due ASC;

// "I'm seeing Sarah tonight — anything open with people in her orbit?"
// MATCH (u:User {id:$uid})-[:KNOWS]->(sarah:Person {name:'Sarah'})
// MATCH (u)-[:MADE]->(pr:Promise)-[:TO]->(person:Person)
// WHERE pr.status = 'open'
//   AND EXISTS { MATCH (sarah)-[:INTERESTED_IN]->(t)<-[:INTERESTED_IN]-(person) }
// RETURN person.name, pr.text;
