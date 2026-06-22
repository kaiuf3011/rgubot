async function testQuery(msg) {
  const res = await fetch('http://127.0.0.1:3001/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, sessionId: "test-" + Date.now(), stream: true })
  });
  
  const text = await res.text();
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('data: ') && lines[i] !== 'data: [DONE]') {
      const parsed = JSON.parse(lines[i].slice(6));
      if (parsed.type === 'complete') {
        console.log(`QUERY: ${msg}`);
        console.log(`ANSWER: ${parsed.data.answer}`);
        console.log(`INTENT: ${parsed.data.intent}`);
        console.log('---');
        return;
      }
    }
  }
}

async function run() {
  await testQuery("list out the btech courses !");
  await testQuery("do you offer b.e with cyber security?");
}
run();
