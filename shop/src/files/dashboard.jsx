// src/files/dashboard.jsx
import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate, Outlet, NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Truck, 
  Receipt, 
  Menu, 
  X, 
  LogOut, 
  ChevronDown, 
  Settings, 
  UserCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import './dashboard.css';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const profileRef = useRef(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

  // --- 1. Authentication & Data Fetching ---
  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');

      if (!token) {
        navigate('/', { replace: true });
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUser(response.data);
        setError('');
      } catch (err) {
        console.error("Auth Error:", err);
        setError('Session expired. Redirecting...');
        localStorage.removeItem('token');
        setTimeout(() => navigate('/', { replace: true }), 2000);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUser();
  }, [navigate, API_URL]);

  // --- 2. Event Listeners ---
  useEffect(() => {
    // Auto-close sidebar on mobile when route changes
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  }, [location]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/', { replace: true });
  };

  // --- 3. Render Helpers ---
  if (error) return (
    <div className="d-modern-layout d-center-state">
      <div className="d-error-card">
        <AlertCircle size={40} className="d-text-danger" />
        <p>{error}</p>
      </div>
    </div>
  );

  if (isLoading || !user) return (
    <div className="d-modern-layout d-center-state">
      <Loader2 size={40} className="d-spinner" />
    </div>
  );

  return (
    <div className={`d-modern-layout ${isSidebarOpen ? 'd-sb-expanded' : 'd-sb-collapsed'}`}>
      
      {/* === SIDEBAR === */}
      <aside className="d-sidebar">
        <div className="d-sidebar-header">
          <div className="d-logo-wrapper">
            <div className="d-logo-icon">DP</div>
            <h1 className={`d-logo-text ${!isSidebarOpen && 'd-hidden'}`}>DevPortal</h1>
          </div>
        </div>

        <nav className="d-sidebar-nav">
          {/* Category: Main */}
          <div className="d-nav-category">
            <span className={`d-cat-label ${!isSidebarOpen && 'd-hidden'}`}>ANALYTICS</span>
          </div>
          <NavItem to="/dashboard" icon={<LayoutDashboard size={20} />} label="Overview" isOpen={isSidebarOpen} end />

          {/* Category: Management */}
          <div className="d-nav-category">
             <span className={`d-cat-label ${!isSidebarOpen && 'd-hidden'}`}>MANAGEMENT</span>
          </div>
          <NavItem to="/dashboard/products" icon={<Package size={20} />} label="Products" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/suppliers" icon={<Truck size={20} />} label="Suppliers" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/customers" icon={<Users size={20} />} label="Customers" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/restock" icon={<Truck size={20} />} label="Restock Product" isOpen={isSidebarOpen} />

          {/* Category: Finance */}
          <div className="d-nav-category">
             <span className={`d-cat-label ${!isSidebarOpen && 'd-hidden'}`}>FINANCE</span>
          </div>
          <NavItem to="/dashboard/retail-billing" icon={<Receipt size={20} />} label="Retail Billing" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/view-retail-bills" icon={<Receipt size={20} />} label="View Retil Bills" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/wholesale-billing" icon={<Receipt size={20} />} label="Create Wholesale Biils" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/view-wholesale-bills" icon={<Receipt size={20} />} label="View Wholesale bills" isOpen={isSidebarOpen} />

        </nav>

        <div className="d-sidebar-footer">
          {isSidebarOpen ? <small>v2.0 Pro</small> : <small>v2</small>}
        </div>
      </aside>

      {/* === MAIN CONTENT === */}
      <div className="d-main-wrapper">
        
        {/* Top Navbar */}
        <header className="d-topbar">
          <div className="d-topbar-left">
             <button 
              className="d-toggle-btn" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle Sidebar"
            >
              {isSidebarOpen ? <Menu size={20} /> : <Menu size={20} />}
            </button>
            <h2 className="d-page-title">
              {getPageTitle(location.pathname)}
            </h2>
          </div>

          <div className="d-topbar-right" ref={profileRef}>
            <button 
              className={`d-profile-trigger ${isProfileOpen ? 'd-active' : ''}`}
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <div className="d-avatar">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="d-user-info">
                <span className="d-username">{user.name}</span>
                <span className="d-userrole">Admin</span>
              </div>
              <ChevronDown size={16} className={`d-chevron ${isProfileOpen ? 'd-rotate' : ''}`} />
            </button>

            {/* Profile Dropdown */}
            <div className={`d-dropdown-menu ${isProfileOpen ? 'd-show' : ''}`}>
              <div className="d-dropdown-header">
                <p className="d-dd-name">{user.name}</p>
                <p className="d-dd-email">{user.email || 'user@portal.com'}</p>
              </div>
              <ul className="d-dropdown-list">
                <li>
                  <button onClick={() => navigate('/dashboard/settings')}>
                    <Settings size={16} /> Settings
                  </button>
                </li>
                <li className="d-divider"></li>
                <li>
                  <button onClick={handleLogout} className="d-text-danger">
                    <LogOut size={16} /> Logout
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </header>

        {/* Dynamic Content Area */}
        <main className="d-content-area">
          <Outlet context={{ user }} />
        </main>
      </div>

    </div>
  );
};

// Sub-component for Nav Item
const NavItem = ({ to, icon, label, isOpen, end = false }) => (
  <NavLink 
    to={to} 
    end={end}
    className={({ isActive }) => `d-nav-item ${isActive ? 'd-active' : ''}`}
    title={!isOpen ? label : ''}
  >
    <span className="d-nav-icon">{icon}</span>
    <span className={`d-nav-text ${!isOpen && 'd-hidden'}`}>{label}</span>
  </NavLink>
);

// Helper for Title
const getPageTitle = (path) => {
  if (path === '/dashboard') return 'Dashboard Overview';
  if (path.includes('products')) return 'Product Inventory';
  if (path.includes('suppliers')) return 'Supplier Directory';
  if (path.includes('customers')) return 'Client Database';
  if (path.includes('retail-billing')) return 'Point of Sale (POS)';
  if (path.includes('settings')) return 'System Settings';
  return 'Dashboard';
};

export default Dashboard;