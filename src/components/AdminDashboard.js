import React, { useState, useEffect } from 'react';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/admin/users');
        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }
        const data = await response.json();
        setUsers(data.users || []);
      } catch (err) {
        setError(err.message);
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleLogout = () => {
    // For now, redirect to the root or login page
    // In a real app, you'd clear tokens/session state
    window.location.href = "/"; 
  };

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto bg-white rounded-xl shadow-md space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow transition-colors"
        >
          Logout
        </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by email..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading users...</p>
        </div>
      )}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}
      {!isLoading && !error && filteredUsers.length === 0 && (
        <p className="text-gray-600 text-center py-4">
          {users.length > 0 ? 'No users match your search.' : 'No registered users found.'}
        </p>
      )}
      {!isLoading && !error && filteredUsers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg shadow overflow-hidden">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Email</th>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Name</th>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">ID Number</th>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Date of Birth</th>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Expiry Date</th>
                {/* Add more columns as needed */}
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {filteredUsers.map((user, index) => (
                <tr key={index} className="hover:bg-gray-100 border-b border-gray-200">
                  <td className="text-left py-3 px-4">{user.email}</td>
                  <td className="text-left py-3 px-4">{user.idDetails?.name || 'N/A'}</td>
                  <td className="text-left py-3 px-4">{user.idDetails?.idNumber || 'N/A'}</td>
                  <td className="text-left py-3 px-4">{user.idDetails?.dateOfBirth || 'N/A'}</td>
                  <td className="text-left py-3 px-4">{user.idDetails?.expiry || 'N/A'}</td>
                  {/* Render more user details */}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 
