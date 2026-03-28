/**
 * Direct test of the orchestrator → Axon issue creation flow.
 * Runs outside of Next.js to isolate the exact failure point.
 */

const AXON_BASE = 'http://127.0.0.1:8400/api';
const COMPANY_ID = '8fc360f2-31bc-4ab2-a441-e69b2d260126';

async function axonRequest(path, method = 'GET', body = null) {
  const url = `${AXON_BASE}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();

  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log('=== ORCHESTRATOR FLOW TEST ===\n');

  // Step 1: List agents and resolve IDs
  console.log('1. Resolving agent IDs...');
  const agentsRes = await axonRequest(`/companies/${COMPANY_ID}/agents`);
  if (!agentsRes.ok) {
    console.error('   FAIL: Cannot list agents:', agentsRes.status, agentsRes.data);
    return;
  }

  const agents = agentsRes.data;
  console.log(`   Found ${agents.length} agents`);

  const scanKeywords = ['head of research', 'market research analyst', 'research'];
  let scanAgentId = null;
  for (const kw of scanKeywords) {
    const match = agents.find(a =>
      (a.title || '').toLowerCase().includes(kw) || (a.role || '').toLowerCase().includes(kw)
    );
    if (match) {
      scanAgentId = match.id;
      console.log(`   Scan agent: ${match.title} (${match.id})`);
      break;
    }
  }
  if (!scanAgentId) console.log('   WARNING: No scan agent found');

  // Step 2: Create a deep analysis issue (exactly like orchestrator does)
  console.log('\n2. Creating deep analysis issue...');
  const issueBody = {
    title: 'TEST: Deep Analysis: BTC — build thesis + triggers',
    description: 'Test issue from orchestrator flow test',
    issue_type: 'trading',
    priority: 'medium',
    ...(scanAgentId ? { assigned_agent_id: scanAgentId } : {}),
  };
  console.log('   Request body:', JSON.stringify(issueBody, null, 2));

  const createRes = await axonRequest(`/companies/${COMPANY_ID}/issues`, 'POST', issueBody);
  console.log(`   Response: ok=${createRes.ok} status=${createRes.status}`);
  console.log(`   Data type: ${typeof createRes.data}`);
  console.log(`   Data keys: ${typeof createRes.data === 'object' ? Object.keys(createRes.data).join(', ') : 'N/A'}`);

  if (createRes.ok && createRes.data?.id) {
    console.log(`   SUCCESS: Issue ID = ${createRes.data.id}`);
    console.log(`   Status: ${createRes.data.status}`);
    console.log(`   Assigned: ${createRes.data.assigned_agent_id}`);

    // Step 3: Simulate what the orchestrator does with the result
    console.log('\n3. Simulating orchestrator state update...');
    const state = {
      symbol: 'BTC/USDT:USDT',
      phase: 'idle',
      activeIssueId: null,
    };

    // This is exactly what createDeepAnalysisIssue does:
    state.phase = 'analyzing';
    state.activeIssueId = createRes.data.id;
    console.log(`   State after update: phase=${state.phase} issueId=${state.activeIssueId}`);

    // Step 4: Check the issue exists in Axon
    console.log('\n4. Verifying issue in Axon...');
    const getRes = await axonRequest(`/companies/${COMPANY_ID}/issues/${createRes.data.id}`);
    console.log(`   Fetch result: ok=${getRes.ok} status=${getRes.status}`);
    if (getRes.ok) {
      console.log(`   Title: ${getRes.data.title}`);
      console.log(`   Status: ${getRes.data.status}`);
      console.log(`   Assigned: ${getRes.data.assigned_agent_id}`);
    }

    // Step 5: Clean up test issue
    console.log('\n5. Cleaning up test issue...');
    const delRes = await axonRequest(`/issues/${createRes.data.id}`, 'DELETE');
    console.log(`   Delete: ok=${delRes.ok}`);
  } else {
    console.error('   FAIL: Issue creation returned ok=false or no id');
    console.error('   Full response:', JSON.stringify(createRes.data, null, 2));
  }

  // Step 6: Test the AxonClient wrapper (same as orchestrator uses)
  console.log('\n6. Testing via AxonClient-style wrapper...');

  async function clientRequest(path, init) {
    try {
      const res = await fetch(`${AXON_BASE}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      });
      if (!res.ok) {
        const body = await res.text();
        let detail;
        try { detail = JSON.parse(body).detail ?? body; } catch { detail = body; }
        return { ok: false, error: detail, status: res.status };
      }
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message, status: 0 };
    }
  }

  const wrapperRes = await clientRequest(`/companies/${COMPANY_ID}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'TEST2: wrapper test',
      description: 'test',
      issue_type: 'trading',
      priority: 'low',
      ...(scanAgentId ? { assigned_agent_id: scanAgentId } : {}),
    }),
  });

  console.log(`   Wrapper result: ok=${wrapperRes.ok}`);
  if (wrapperRes.ok) {
    console.log(`   ID: ${wrapperRes.data.id}`);
    console.log(`   Phase would be: analyzing`);
    // Clean up
    await axonRequest(`/issues/${wrapperRes.data.id}`, 'DELETE');
    console.log('   Cleaned up');
  } else {
    console.error(`   FAIL:`, wrapperRes.error, `status=${wrapperRes.status}`);
  }

  console.log('\n=== TEST COMPLETE ===');
}

main().catch(console.error);
