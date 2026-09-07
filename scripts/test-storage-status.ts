import * as fs from 'fs';

const staging = fs.readFileSync('.env.staging', 'utf8');
const mDb = staging.match(/DATABASE_URL=[\"']?([^\"'\r\n]+)/);
if (mDb) {
  const parsed = new URL(mDb[1].trim());
  const ref = parsed.username.split('.')[1];
  const url = `https://${ref}.supabase.co/storage/v1/status`;
  console.log('Testing URL endpoint for ref:', ref.slice(0, 3) + '***' + ref.slice(-3));
  fetch(url)
    .then(res => {
      console.log('Status HTTP Code:', res.status);
      return res.text();
    })
    .then(text => console.log('Response body:', text))
    .catch(err => console.error('Fetch error:', err.message));
}
