// src/files/dashboard.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { UserCircleIcon, PhoneIcon, EnvelopeIcon, ArrowLeftOnRectangleIcon, BriefcaseIcon } from '@heroicons/react/24/outline';
import './dashboard.css';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Access the URL from .env
  const API_URL = process.env.REACT_APP_API_URL;

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        
        // Updated Axios Call
        const response = await axios.get(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setUser(response.data);
      } catch (err) {
        setError('Session expired or unauthorized');
        localStorage.removeItem('token');
        setTimeout(() => navigate('/'), 2000);
      }
    };
    fetchUser();
  }, [navigate, API_URL]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  if (error) return <div className="dash-error">{error}</div>;
  if (!user) return <div className="dash-loading"><div className="loader"></div></div>;

  return (
    // ... (Rest of the JSX remains exactly the same as previous response)
    <div className="dashboard-container">
      <nav className="navbar">
        <h1>DevPortal</h1>
        <button onClick={handleLogout} className="logout-btn">
          <span>Logout</span>
          <ArrowLeftOnRectangleIcon className="icon-sm" />
        </button>
      </nav>

      <main className="main-content">
        <div className="welcome-section">
          <h2>Hello, <span className="highlight">{user.name}</span>!</h2>
          <p>Here is your profile overview.</p>
        </div>

        <div className="profile-card">
          <div className="card-header">
            <div className="avatar">
                <span className="initial">{user.name.charAt(0)}</span>
            </div>
            <div className="role-badge">
                <BriefcaseIcon className="icon-xs" /> {user.role_name}
            </div>
          </div>
          
          <div className="card-body">
            <div className="info-item">
              <UserCircleIcon className="icon-md" />
              <div>
                <label>Full Name</label>
                <p>{user.name}</p>
              </div>
            </div>

            <div className="info-item">
              <EnvelopeIcon className="icon-md" />
              <div>
                <label>Email Address</label>
                <p>{user.email}</p>
              </div>
            </div>

            <div className="info-item">
              <PhoneIcon className="icon-md" />
              <div>
                <label>Mobile Number</label>
                <p>{user.mobile || 'N/A'}</p>
              </div>
            </div>
            
            <div className="info-footer">
                <small>Member since: {new Date(user.created_at).toLocaleDateString()}</small>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;