const messagesContainer = document.getElementById('chat-messages');
const suggestionsContainer = document.getElementById('suggestions-container');
const userInput = document.getElementById('user-input');
const typingIndicator = document.getElementById('typing-indicator');
const sendBtn = document.getElementById('send-btn');
const resetBtn = document.getElementById('reset-btn');

let currentController = null;

// Convert markdown-like syntax to basic HTML
function formatText(text) {
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

function scrollToBottom() {
  messagesContainer.scrollTo({
    top: messagesContainer.scrollHeight,
    behavior: 'smooth'
  });
}

function appendUserMessage(text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper user-wrapper fade-in';
  wrapper.innerHTML = `
    <div class="message-bubble user-bubble">
      <p>${formatText(text)}</p>
    </div>
  `;
  messagesContainer.appendChild(wrapper);
  scrollToBottom();
}

function createBotMessageContainer() {
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper bot-wrapper fade-in';
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble bot-bubble';
  
  wrapper.appendChild(bubble);
  messagesContainer.appendChild(wrapper);
  scrollToBottom();
  
  return bubble;
}

function renderHighlightsAndSuggestions(bubble, data) {
  if (data.highlights && data.highlights.length > 0) {
    const hlContainer = document.createElement('div');
    hlContainer.className = 'bot-highlights fade-in';
    const ul = document.createElement('ul');
    data.highlights.forEach(h => {
      const li = document.createElement('li');
      li.innerHTML = formatText(h);
      ul.appendChild(li);
    });
    hlContainer.appendChild(ul);
    bubble.appendChild(hlContainer);
  }

  suggestionsContainer.innerHTML = '';
  if (data.suggestions && data.suggestions.length > 0) {
    data.suggestions.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'suggestion-chip fade-in';
      chip.innerText = s;
      chip.onclick = () => {
        userInput.value = s;
        sendMessage();
      };
      suggestionsContainer.appendChild(chip);
    });
  }
  scrollToBottom();
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // Clear suggestions
  suggestionsContainer.innerHTML = '';
  
  // Abort previous stream if active
  if (currentController) {
    currentController.abort();
  }

  appendUserMessage(text);
  userInput.value = '';
  typingIndicator.style.display = 'flex';
  scrollToBottom();

  currentController = new AbortController();

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: text, stream: true }),
      signal: currentController.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    typingIndicator.style.display = 'none';
    const botBubble = createBotMessageContainer();
    
    // Setup SSE Reader
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let partialText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') break;
          
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === 'token') {
              partialText += parsed.content;
              botBubble.innerHTML = `<p>${formatText(partialText)}</p>`;
              scrollToBottom();
            } else if (parsed.type === 'complete') {
              renderHighlightsAndSuggestions(botBubble, parsed.data);
            } else if (parsed.type === 'error') {
              botBubble.innerHTML += `<p style="color: #ef4444;"><br><em>Stream interrupted.</em></p>`;
            }
          } catch (e) {
            console.error("Parse error on chunk:", dataStr);
          }
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    typingIndicator.style.display = 'none';
    const botBubble = createBotMessageContainer();
    botBubble.innerHTML = `<p style="color: #ef4444;">Server connection failed. Please try again.</p>`;
  } finally {
    currentController = null;
    typingIndicator.style.display = 'none';
  }
}

async function resetConversation() {
  try {
    await fetch('/chat/reset', { method: 'POST' });
    messagesContainer.innerHTML = '';
    suggestionsContainer.innerHTML = '';
    
    // Add welcome message
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper bot-wrapper fade-in';
    wrapper.innerHTML = `
      <div class="message-bubble bot-bubble">
        <p>Conversation reset. How can I help you?</p>
      </div>
    `;
    messagesContainer.appendChild(wrapper);
  } catch (err) {
    console.error("Failed to reset session", err);
  }
}

// Event Listeners
sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

resetBtn.addEventListener('click', resetConversation);

// Initial focus
userInput.focus();
