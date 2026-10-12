import http from 'http';
http.get('http://localhost:3000/api/tasa-bcv?date=2026-07-02', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(res.statusCode, data));
});
