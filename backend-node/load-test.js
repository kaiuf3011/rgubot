// using built in fetch

async function runTest(concurrentUsers) {
  console.log(`\n--- Running Load Test with ${concurrentUsers} concurrent users ---`);
  const promises = [];
  
  for (let i = 0; i < concurrentUsers; i++) {
    promises.push((async () => {
      const startTime = Date.now();
      let firstTokenTime = null;
      let chunks = 0;
      
      try {
        const controller = new AbortController();
        const res = await fetch('http://localhost:3001/chat', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({message: 'What is Raise Smart?', stream: true}),
          signal: controller.signal
        });
        
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        
        while(true) {
          const {done, value} = await reader.read();
          if(done) break;
          
          const text = decoder.decode(value);
          if (text.includes('"type":"token"') && !firstTokenTime) {
            firstTokenTime = Date.now() - startTime;
          }
          chunks++;
        }
        
        const totalTime = Date.now() - startTime;
        return { success: true, ttft: firstTokenTime || totalTime, ttlt: totalTime, chunks };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })());
  }
  
  const results = await Promise.all(promises);
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const avgTtft = successful.reduce((acc, r) => acc + r.ttft, 0) / (successful.length || 1);
  const avgTtlt = successful.reduce((acc, r) => acc + r.ttlt, 0) / (successful.length || 1);
  
  console.log(`Successful streams: ${successful.length}`);
  console.log(`Failed streams: ${failed.length}`);
  console.log(`Average TTFT: ${avgTtft.toFixed(2)} ms`);
  console.log(`Average TTLT: ${avgTtlt.toFixed(2)} ms`);
  console.log(`Average Chunks: ${(successful.reduce((acc, r) => acc + r.chunks, 0) / (successful.length || 1)).toFixed(2)}`);
}

(async () => {
  await runTest(1);
  await runTest(5);
  await runTest(10);
})();
