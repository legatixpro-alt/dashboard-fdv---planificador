import https from 'https';
https.get('https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/htmlview', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const regex = /\{[^{}]*"name":"([^"]+)","gid":"?(\d+)"?[^{}]*\}/g;
    let match;
    const sheets = [];
    while ((match = regex.exec(data)) !== null) {
      sheets.push({ name: match[1], gid: match[2] });
    }
    console.log(JSON.stringify(sheets, null, 2));
    
    // Alternative regex if the first fails
    if (sheets.length === 0) {
        const altRegex = /gid=(\d+)[^>]*>([^<]+)<\/a>/g;
        while ((match = altRegex.exec(data)) !== null) {
            sheets.push({ name: match[2], gid: match[1] });
        }
        console.log("ALT REGEX:", JSON.stringify(sheets, null, 2));
    }
  });
});
