import React, { useState, useEffect } from 'react';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [isVideoLoadingModal, setIsVideoLoadingModal] = useState(false);
  const [videoModalError, setVideoModalError] = useState(null);
  const [approvingUserId, setApprovingUserId] = useState(null);
  const [expandedUserId, setExpandedUserId] = useState(null);

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

  const openVideoModal = async (s3Key) => {
    if (!s3Key) return;
    setCurrentVideoUrl('');
    setVideoModalError(null);
    setIsVideoLoadingModal(true);
    setShowVideoModal(true);

    try {
      const response = await fetch(`/api/admin/get-s3-video-url?s3Key=${encodeURIComponent(s3Key)}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch video URL');
      }
      setCurrentVideoUrl(data.url);
    } catch (err) {
      console.error("Error fetching pre-signed URL:", err);
      setVideoModalError(err.message);
      setCurrentVideoUrl('');
    } finally {
      setIsVideoLoadingModal(false);
    }
  };

  const closeVideoModal = () => {
    setShowVideoModal(false);
    setCurrentVideoUrl('');
  };

  const handleApproveUser = async (emailToApprove) => {
    if (!emailToApprove) return;
    setApprovingUserId(emailToApprove);

    try {
      const response = await fetch('/api/admin/approve-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToApprove }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to approve user');
      }

      setUsers(currentUsers => 
        currentUsers.map(user => 
          user.email === emailToApprove ? { ...user, status: 'approved' } : user
        )
      );
      alert(`User ${emailToApprove} approved successfully.`);

    } catch (err) {
      console.error("Error approving user:", err);
      alert(`Error approving user: ${err.message}`);
    } finally {
      setApprovingUserId(null);
    }
  };

  const toggleUserDetails = (userId) => {
    setExpandedUserId(expandedUserId === userId ? null : userId);
  };

  return (
    <div className="p-6 max-w-[90%] mx-auto bg-white rounded-xl shadow-md space-y-6">
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
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm w-12"></th>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Email</th>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Status</th>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Front ID Video</th>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Back ID Video</th>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Selfie Video</th>
                <th className="text-left py-3 px-4 uppercase font-semibold text-sm">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {filteredUsers.map((user, index) => (
                <React.Fragment key={user.email || index}>
                  <tr className="hover:bg-gray-100 border-b border-gray-200">
                    <td className="text-center py-3 px-4">
                      <button
                        onClick={() => toggleUserDetails(user.email)}
                        className="text-blue-500 hover:text-blue-700 text-xl"
                        aria-label="Toggle details"
                      >
                        {expandedUserId === user.email ? '\u2296' : '\u2295'}
                      </button>
                    </td>
                    <td className="text-left py-3 px-4">{user.email}</td>
                    <td className="text-left py-3 px-4">{user.status || 'N/A'}</td>
                    <td className="text-left py-3 px-4">
                      {user.frontIdVideoS3Key ? (
                        <button 
                          onClick={() => openVideoModal(user.frontIdVideoS3Key)}
                          className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                        >
                          View Front Video
                        </button>
                      ) : 'N/A'}
                    </td>
                    <td className="text-left py-3 px-4">
                      {user.backIdVideoS3Key ? (
                        <button 
                          onClick={() => openVideoModal(user.backIdVideoS3Key)}
                          className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                        >
                          View Back Video
                        </button>
                      ) : 'N/A'}
                    </td>
                    <td className="text-left py-3 px-4">
                      {user.selfieVideoS3Key ? (
                        <button 
                          onClick={() => openVideoModal(user.selfieVideoS3Key)}
                          className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                        >
                          View Selfie Video
                        </button>
                      ) : 'N/A'}
                    </td>
                    <td className="text-left py-3 px-4">
                      {user.status !== 'approved' && (
                        <button
                          onClick={() => handleApproveUser(user.email)}
                          disabled={approvingUserId === user.email}
                          className={`px-3 py-1 text-xs rounded transition-colors 
                            ${approvingUserId === user.email 
                              ? 'bg-gray-400 text-gray-700 cursor-not-allowed' 
                              : 'bg-green-500 hover:bg-green-600 text-white'}
                          `}
                        >
                          {approvingUserId === user.email ? 'Approving...' : 'Approve'}
                        </button>
                      )}
                      {user.status === 'approved' && (
                        <span className="text-xs text-green-600 font-semibold">Approved</span>
                      )}
                    </td>
                  </tr>
                  {expandedUserId === user.email && (
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <td colSpan="7" className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white rounded shadow">
                          <div>
                            <h4 className="font-semibold text-gray-700 mb-1">Full Name:</h4>
                            <p className="text-gray-600">{user.idDetails?.fullName || 'N/A'}</p>
                          </div>
                          {user.idDetails?.fatherName && user.idDetails?.fatherName !== 'Not found' && user.idDetails?.fatherName !== 'N/A' && (
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-1">Father's Name:</h4>
                              <p className="text-gray-600">{user.idDetails.fatherName}</p>
                            </div>
                          )}
                          <div>
                            <h4 className="font-semibold text-gray-700 mb-1">ID Number:</h4>
                            <p className="text-gray-600">{user.idDetails?.idNumber || 'N/A'}</p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-700 mb-1">Date of Birth:</h4>
                            <p className="text-gray-600">{user.idDetails?.dateOfBirth || 'N/A'}</p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-700 mb-1">Expiry Date:</h4>
                            <p className="text-gray-600">{user.idDetails?.expiry || 'N/A'}</p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-700 mb-1">Gender:</h4>
                            <p className="text-gray-600">{user.idDetails?.gender || 'N/A'}</p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-700 mb-1">Issue Date:</h4>
                            <p className="text-gray-600">{user.idDetails?.issueDate || 'N/A'}</p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-700 mb-1">Nationality:</h4>
                            <p className="text-gray-600">{user.idDetails?.nationality || 'N/A'}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showVideoModal && currentVideoUrl && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={(e) => {
            // If the click is on the backdrop itself, close the modal
            if (e.target === e.currentTarget) {
              closeVideoModal();
            }
          }}
        >
          <div className="bg-white p-4 rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold">ID Capture Video</h3>
              <button 
                onClick={closeVideoModal} 
                className="text-black hover:text-gray-700 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            {isVideoLoadingModal && (
              <div className="text-center py-10">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-700 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading video...</p>
              </div>
            )}
            {videoModalError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-2" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{videoModalError}</span>
              </div>
            )}
            {!isVideoLoadingModal && currentVideoUrl && !videoModalError && (
              <video key={currentVideoUrl} controls autoPlay className="w-full max-h-[70vh] rounded">
                <source src={currentVideoUrl} type="video/webm" />
                Your browser does not support the video tag.
              </video>
            )}
            {!isVideoLoadingModal && !currentVideoUrl && !videoModalError && (
              <p className="text-center text-gray-500 py-10">Video could not be loaded.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 
