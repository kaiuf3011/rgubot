(async () => {
  const startTime = Date.now();
  try {
    const res = await fetch('http://localhost:3001/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message: 'Hello', stream: true})
    });
    console.log('Headers received in', Date.now() - startTime, 'ms');
    
    if (!res.body) {
      console.log('No response body');
      return;
    }
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let chunks = 0;
    while(true) {
      const {done, value} = await reader.read();
      if(done) break;
      chunks++;
      console.log('Chunk', chunks, 'at', Date.now() - startTime, 'ms:', decoder.decode(value).substring(0, 50).replace(/\n/g, '\\n'));
    }
    console.log('Total chunks:', chunks);
  } catch (err) {
    console.error(err);
  }
})();
