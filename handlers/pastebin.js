async function upload(text) {
  const services = [
    async () => {
      const res = await fetch('https://dpaste.org/api/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ content: text, format: 'url', expiry_days: '30' }),
      });
      if (!res.ok) throw new Error('dpaste.org: ' + res.status);
      return (await res.text()).trim();
    },
    async () => {
      const res = await fetch('https://paste.rs/', {
        method: 'POST',
        body: text,
      });
      if (!res.ok) throw new Error('paste.rs: ' + res.status);
      return (await res.text()).trim();
    },
  ];

  for (const service of services) {
    try {
      return await service();
    } catch (err) {
      console.error('Pastebin upload failed:', err.message);
    }
  }
  return null;
}

module.exports = { upload };
