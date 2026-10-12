fetch("http://localhost:3000/api/client-lookup?codigo=1001")
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));
