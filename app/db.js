const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://czelhizizienwnnopfou.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZWxoaXppemllbndubm9wZm91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NjczMTcsImV4cCI6MjEwMjA0MzMxN30.I-gnYruLS6gkGO91ibBXvyOm8zRjXp_DOWaDIZkuFYM'
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