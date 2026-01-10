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
  LogOut, 
  ChevronDown, 
  Settings, 
  AlertCircle, 
  Loader2,
  PieChart,
  FileBarChart,
  ClipboardList
} from 'lucide-react';
import './dashboard.css';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
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
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-close sidebar on mobile route change
  useEffect(() => {
    if (isMobile) setIsSidebarOpen(false);
  }, [location, isMobile]);

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
    <div className="dash-v2-center">
      <div className="dash-v2-error">
        <AlertCircle size={24} />
        <p style={{ margin: 0, fontWeight: 500 }}>{error}</p>
      </div>
    </div>
  );

  if (isLoading || !user) return (
    <div className="dash-v2-center">
      <Loader2 size={40} className="dash-v2-spinner" />
    </div>
  );

  return (
    <div className="dash-v2-layout">
      
      {/* === SIDEBAR === */}
      <aside className={`dash-v2-sidebar ${!isSidebarOpen ? 'collapsed' : ''} ${isMobile && isSidebarOpen ? 'mobile-open' : ''}`}>
        
        {/* 1. Header (Fixed) */}
        <div className="dash-v2-logo-area">
          <div className="dash-v2-logo-icon">DP</div>
          <span className="dash-v2-logo-text">DevPortal</span>
        </div>

        {/* 2. Navigation (Scrollable) */}
        <nav className="dash-v2-nav-scroll">
          <NavCategory label="ANALYTICS" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard" icon={<LayoutDashboard size={18} />} label="Overview" isOpen={isSidebarOpen} end />

          <NavCategory label="MANAGEMENT" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/products" icon={<Package size={18} />} label="Products" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/suppliers" icon={<Truck size={18} />} label="Suppliers" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/customers" icon={<Users size={18} />} label="Customers" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/restock" icon={<ClipboardList size={18} />} label="Restock Product" isOpen={isSidebarOpen} />

          <NavCategory label="FINANCE" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/retail-billing" icon={<Receipt size={18} />} label="POS Billing" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/view-retail-bills" icon={<FileBarChart size={18} />} label="Retail Bills" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/wholesale-billing" icon={<Receipt size={18} />} label="Wholesale POS" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/view-wholesale-bills" icon={<FileBarChart size={18} />} label="Wholesale Bills" isOpen={isSidebarOpen} />
          
          <NavCategory label="REPORTS" isOpen={isSidebarOpen} />
          <NavItem to="/dashboard/reports" icon={<PieChart size={18} />} label="Analytics Reports" isOpen={isSidebarOpen} />
        </nav>

        {/* 3. Footer (Fixed) */}
        <div className="dash-v2-footer">
          {isSidebarOpen ? 'v2.0 Pro System' : 'v2.0'}
        </div>
      </aside>

      {/* === MAIN WRAPPER === */}
      <div className="dash-v2-main">
        
        {/* Top Navbar */}
        <header className="dash-v2-topbar">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button 
              className="dash-v2-toggle-btn" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle Sidebar"
            >
              <Menu size={20} />
            </button>
            <h2 className="dash-v2-page-title">
              {getPageTitle(location.pathname)}
            </h2>
          </div>

          <div className="dash-v2-profile-wrap" ref={profileRef}>
            <button 
              className={`dash-v2-profile-btn ${isProfileOpen ? 'open' : ''}`}
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <div className="dash-v2-avatar">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              {!isMobile && (
                <div className="dash-v2-user-details">
                  <span className="dash-v2-user-name">{user.name}</span>
                  <span className="dash-v2-user-role">Admin</span>
                </div>
              )}
              <ChevronDown size={14} style={{ color: '#6b7280', transform: isProfileOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
            </button>

            {/* Profile Dropdown */}
            <div className={`dash-v2-dropdown ${isProfileOpen ? 'show' : ''}`}>
              <div className="dash-v2-dropdown-header">
                <p className="dash-v2-dd-name">{user.name}</p>
                <p className="dash-v2-dd-email">{user.email || 'user@portal.com'}</p>
              </div>
              <div style={{ padding: '4px' }}>
                <button className="dash-v2-dd-item" onClick={() => navigate('/dashboard/settings')}>
                  <Settings size={16} /> Settings
                </button>
                <div style={{ height: '1px', background: '#f3f4f6', margin: '4px 0' }}></div>
                <button onClick={handleLogout} className="dash-v2-dd-item danger">
                  <LogOut size={16} /> Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Content Area */}
        <main className="dash-v2-content">
          <Outlet context={{ user }} />
        </main>
      </div>

    </div>
  );
};

// --- Sub Components ---

const NavCategory = ({ label, isOpen }) => (
  <div className={`dash-v2-cat-label ${!isOpen ? 'hidden' : ''}`}>
    {label}
  </div>
);

const NavItem = ({ to, icon, label, isOpen, end = false }) => (
  <NavLink 
    to={to} 
    end={end}
    className={({ isActive }) => `dash-v2-nav-item ${isActive ? 'active' : ''}`}
    title={!isOpen ? label : ''}
  >
    <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
    {isOpen && <span>{label}</span>}
  </NavLink>
);

// Helper for Title
const getPageTitle = (path) => {
  if (path === '/dashboard') return 'Overview';
  if (path.includes('products')) return 'Product Inventory';
  if (path.includes('suppliers')) return 'Supplier Directory';
  if (path.includes('customers')) return 'Client Database';
  if (path.includes('retail-billing')) return 'Point of Sale';
  if (path.includes('wholesale-billing')) return 'Wholesale Order';
  if (path.includes('reports')) return 'System Reports';
  if (path.includes('settings')) return 'Settings';
  return 'Dashboard';
};

export default Dashboard;