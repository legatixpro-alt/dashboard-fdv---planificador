import https from 'https';

https.get('https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=csv&gid=0', (res) => {
  if (res.statusCode === 307 || res.statusCode === 302) {
    https.get(res.headers.location, (res2) => {
      let data = '';
      res2.on('data', c => data += c);
      res2.on('end', () => console.log(data.substring(0, 100)));
    });
  }
});
