const { createClient } = require('@supabase/supabase-js');
// Test the connection
supabase
  .from('locations')
  .select('*')
  .limit(1)
  .then(({ data, error }) => {
    if (error) console.error('Connection error:', error);
    else console.log('Connected:', data);
  });