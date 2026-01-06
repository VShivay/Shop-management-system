// src/files/main/dashboard_home.jsx
import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { 
  User, 
  Phone, 
  Mail, 
  Briefcase, 
  Calendar, 
  ShieldCheck, 
  Clock,
  Activity,
  MapPin
} from 'lucide-react';
import './css/dashboard_home.css';

const DashboardHome = () => {
  const { user } = useOutletContext();
  const navigate = useNavigate();

  if (!user) return null;

  const currentDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="dh-container dh-fade-in">
      
      {/* === 1. Welcome Banner === */}
      <div className="dh-banner">
        <div className="dh-banner-content">
          <h2 className="dh-welcome-title">Welcome back, {user.name}!</h2>
          <p className="dh-welcome-text">
            System is running smoothly. You have full access to the developer portal.
          </p>
        </div>
        <div className="dh-banner-date">
           <Calendar size={16} className="dh-icon-white" />
           <span>{currentDate}</span>
        </div>
      </div>

      <div className="dh-grid">
        
        {/* === 2. Profile Card === */}
        <div className="dh-card dh-profile-card">
          <div className="dh-card-header-gradient">
            <div className="dh-avatar-lg">
              {user.name.charAt(0).toUpperCase()}
            </div>
          </div>
          
          <div className="dh-card-body">
            <div className="dh-identity">
              <h3 className="dh-user-name">{user.name}</h3>
              <div className="dh-role-badge">
                <ShieldCheck size={14} />
                <span>{user.role_name || 'Administrator'}</span>
              </div>
            </div>

            <div className="dh-info-list">
              <div className="dh-info-item">
                <div className="dh-icon-box dh-blue">
                  <Mail size={16} />
                </div>
                <div>
                  <label>Email Address</label>
                  <p>{user.email}</p>
                </div>
              </div>

              <div className="dh-info-item">
                <div className="dh-icon-box dh-green">
                  <Phone size={16} />
                </div>
                <div>
                  <label>Phone Number</label>
                  <p>{user.mobile || 'Not Provided'}</p>
                </div>
              </div>

              <div className="dh-info-item">
                <div className="dh-icon-box dh-purple">
                  <Briefcase size={16} />
                </div>
                <div>
                  <label>Department</label>
                  <p>Engineering & Development</p>
                </div>
              </div>
            </div>
            
            <div className="dh-card-footer">
              <small>User ID: #{user.id}</small>
            </div>
          </div>
        </div>

        {/* === 3. Activity / Status Column (New Add) === */}
        <div className="dh-status-column">
          
          {/* Quick Stats */}
          <div className="dh-card dh-stat-card">
            <div className="dh-stat-icon dh-orange">
              <Activity size={20} />
            </div>
            <div className="dh-stat-info">
              <label>System Status</label>
              <p className="dh-text-success">Operational</p>
            </div>
          </div>

          <div className="dh-card dh-stat-card">
            <div className="dh-stat-icon dh-teal">
              <Clock size={20} />
            </div>
            <div className="dh-stat-info">
              <label>Last Login</label>
              <p>{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
            </div>
          </div>

          {/* Account Summary */}
          <div className="dh-card dh-summary-card">
            <h4 className="dh-card-title">Account Overview</h4>
            <div className="dh-summary-row">
              <span>Account Created</span>
              <strong>{new Date(user.created_at || Date.now()).toLocaleDateString()}</strong>
            </div>
            <div className="dh-summary-row">
              <span>Plan Type</span>
              <strong>Pro License</strong>
            </div>
            <div className="dh-summary-row">
              <span>Security Level</span>
              <strong className="dh-text-high">High</strong>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default DashboardHome;