// src/files/main/dashboard_home.jsx
import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  UserCircleIcon, 
  PhoneIcon, 
  EnvelopeIcon, 
  BriefcaseIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline';
import './css/dashboard_home.css';

const DashboardHome = () => {
  // Retrieve user data passed from the parent Dashboard layout
  const { user } = useOutletContext();

  if (!user) return null;

  return (
    <div className="home-container fade-in">
      <div className="welcome-banner">
        <div>
          <h2 className="welcome-title">Welcome back, {user.name}!</h2>
          <p className="welcome-subtitle">Here's what's happening with your account today.</p>
        </div>
        <div className="date-badge">
           <CalendarDaysIcon className="icon-xs" />
           {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
      </div>

      <div className="profile-card-wrapper">
        <div className="profile-card">
          <div className="card-header-gradient">
            <div className="profile-avatar-lg">
              {user.name.charAt(0)}
            </div>
          </div>
          
          <div className="card-content">
            <div className="user-identity">
              <h3>{user.name}</h3>
              <span className="role-tag">
                <BriefcaseIcon className="icon-xs-inline" /> {user.role_name || 'Developer'}
              </span>
            </div>

            <div className="info-grid">
              <div className="info-box">
                <div className="info-icon-bg"><UserCircleIcon className="icon-blue" /></div>
                <div className="info-text">
                  <label>Full Name</label>
                  <p>{user.name}</p>
                </div>
              </div>

              <div className="info-box">
                <div className="info-icon-bg"><EnvelopeIcon className="icon-purple" /></div>
                <div className="info-text">
                  <label>Email</label>
                  <p>{user.email}</p>
                </div>
              </div>

              <div className="info-box">
                <div className="info-icon-bg"><PhoneIcon className="icon-green" /></div>
                <div className="info-text">
                  <label>Mobile</label>
                  <p>{user.mobile || 'Not Provided'}</p>
                </div>
              </div>
            </div>

            <div className="card-footer">
              <small>Member ID: #{user.id} • Joined: {new Date(user.created_at).toLocaleDateString()}</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;