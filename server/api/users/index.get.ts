export default defineEventHandler(async (event) => {
  // Simulate fetching users from a database
  const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com', created: '2024-01-01' },
    { id: 2, name: 'Bob', email: 'bob@example.com', created: '2024-01-02' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com', created: '2024-01-03' }
  ]

  return {
    data: users,
    meta: {
      total: users.length,
      page: 1,
      per_page: 10
    }
  }
})