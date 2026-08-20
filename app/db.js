const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://jxgparaggtwsosmvutjf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4Z3BhcmFnZ3R3c29zbXZ1dGpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNDk2NzYsImV4cCI6MjEwMjgyNTY3Nn0.YBT0R-XD5toXM89sXflVJGuKjhg8hAJNgcdxznNLYBw'
);

// Test the connection
supabase
  .from('locations')
  .select('*')
  .limit(1)
  .then(({ data, error }) => {
    if (error) console.error('Connection error:', error);
    else console.log('Connected:', data);
  });