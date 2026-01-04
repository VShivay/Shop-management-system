// src/files/login.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { LockClosedIcon, EnvelopeIcon, ArrowRightIcon } from '@heroicons/react/24/solid';
import './login.css';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Access the URL from .env
  const API_URL = process.env.REACT_APP_API_URL;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      // Updated Axios Call
      const response = await axios.post(`${API_URL}/login`, formData);
      
      localStorage.setItem('token', response.data.token);
      navigate('/dashboard');
      
    } catch (err) {
      const msg = err.response?.data?.error || 'Server error. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    // ... (Rest of the JSX remains exactly the same as previous response)
    <div className="login-container">
      <div className="glass-card">
        <div className="header">
          <h2>Welcome Back</h2>
          <p>Please enter your details to sign in.</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <EnvelopeIcon className="icon" />
            <input
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              autoComplete="off"
            />
          </div>

          <div className="input-group">
            <LockClosedIcon className="icon" />
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <span className="loader"></span> : (
              <>
                Sign In <ArrowRightIcon className="btn-icon" />
              </>
            )}
          </button>
        </form>
      </div>
      <div className="shape shape-1"></div>
      <div className="shape shape-2"></div>
    </div>
  );
};

export default Login;