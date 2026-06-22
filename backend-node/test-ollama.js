(async () => {
  const startTime = Date.now();
  const prompt = "Explain how to sort an array in javascript in 2 sentences. MUST output JSON with keys 'answer' and 'highlights'.";
  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({model: 'llama3', prompt: prompt, stream: true, format: 'json'})
    });
    console.log('Headers in', Date.now() - startTime, 'ms');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let chunks = 0;
    while(true) {
      const {done, value} = await reader.read();
      if(done) break;
      chunks++;
      console.log('Chunk', chunks, Date.now() - startTime, 'ms', decoder.decode(value).substring(0, 30));
    }
    console.log('Total chunks:', chunks);
  } catch(e) { console.error(e) }
})();
