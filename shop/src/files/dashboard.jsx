// src/files/dashboard.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, Outlet, NavLink, useLocation } from 'react-router-dom';
import { 
  ArrowLeftOnRectangleIcon, 
  HomeIcon, 
  CubeIcon, 
  Bars3Icon,
  XMarkIcon 
} from '@heroicons/react/24/outline';
import './dashboard.css';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const navigate = useNavigate();
  const location = useLocation();

  const API_URL = process.env.REACT_APP_API_URL;

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');

      // 1. IMMEDIATE CHECK: If no token, redirect immediately (replace history)
      if (!token) {
        navigate('/', { replace: true });
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUser(response.data);
      } catch (err) {
        setError('Session expired. Please log in again.');
        localStorage.removeItem('token');
        // 2. ERROR HANDLING: Use replace: true here too
        setTimeout(() => navigate('/', { replace: true }), 2000);
      }
    };
    fetchUser();
  }, [navigate, API_URL]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    
    // 3. LOGOUT LOGIC: Replace current history entry
    // This prevents the "Back" button from returning to the Dashboard
    navigate('/', { replace: true });
  };

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
    }
  }, [location]);

  if (error) return <div className="dash-layout-error">{error}</div>;
  if (!user) return <div className="dash-layout-loading"><div className="loader"></div></div>;

  return (
    <div className={`dashboard-layout ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      
      {/* --- Sidebar --- */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-area">
            <span className="logo-icon">DP</span>
            {isSidebarOpen && <h1 className="logo-text">DevPortal</h1>}
          </div>
          <button className="toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? <XMarkIcon className="icon-sm" /> : <Bars3Icon className="icon-sm" />}
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink 
            to="/dashboard" 
            end 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <HomeIcon className="icon-md" />
            {isSidebarOpen && <span>Dashboard</span>}
          </NavLink>

          <NavLink 
            to="/dashboard/products" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <CubeIcon className="icon-md" />
            {isSidebarOpen && <span>Manage Products</span>}
          </NavLink>
          <NavLink 
            to="/dashboard/suppliers" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <CubeIcon className="icon-md" />
            {isSidebarOpen && <span>Manage Suppliers</span>}
          </NavLink>
          <NavLink 
            to="/dashboard/customers" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <CubeIcon className="icon-md" />
            {isSidebarOpen && <span>Manage Customers</span>}
          </NavLink>
        </nav>

        <div className="sidebar-footer">
           {isSidebarOpen && <small>v1.0.0</small>}
        </div>
      </aside>

      {/* --- Main Content Area --- */}
      <div className="main-wrapper">
        {/* Navbar */}
        <header className="top-navbar">
          <div className="nav-left">
            <h2 className="page-title">
               {location.pathname === '/dashboard' ? 'Overview' : 
                location.pathname.includes('products') ? 'Product Management' : 'Dashboard'}
            </h2>
          </div>
          <div className="nav-right">
             <div className="user-mini-profile">
                <span className="user-name">{user.name}</span>
                <div className="user-avatar-sm">{user.name.charAt(0)}</div>
             </div>
             <button onClick={handleLogout} className="logout-btn" title="Logout">
              <ArrowLeftOnRectangleIcon className="icon-sm" />
             </button>
          </div>
        </header>

        {/* Content Rendered Here */}
        <main className="content-area">
          <Outlet context={{ user }} />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;