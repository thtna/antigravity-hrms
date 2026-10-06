export const config = {
  regions: [process.env.VERCEL_ENV === 'production' ? 'hnd1' : 'sin1'],
};
