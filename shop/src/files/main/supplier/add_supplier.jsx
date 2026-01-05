import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
    UserPlusIcon, 
    BuildingOfficeIcon, 
    PhoneIcon, 
    EnvelopeIcon, 
    MapPinIcon,
    ArrowLeftIcon
} from '@heroicons/react/24/outline';
import './add_supplier.css';

const API_URL = process.env.REACT_APP_API_URL;

const AddSupplier = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        supplier_name: '',
        contact_person: '',
        phone: '',
        email: '',
        gst_number: '',
        address: '',
        is_active: true
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!formData.supplier_name) {
            setError('Supplier Name is required.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/suppliers`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuccess('Supplier added successfully!');
            setTimeout(() => navigate('/dashboard/suppliers'), 1500);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to add supplier.');
        }
    };

    return (
        <div className="as-container">
            <div className="as-header">
                <button onClick={() => navigate(-1)} className="as-back-btn">
                    <ArrowLeftIcon className="as-icon-sm" /> Back
                </button>
                <h2>Add New Supplier</h2>
            </div>

            <form onSubmit={handleSubmit} className="as-form-card">
                {error && <div className="as-alert error">{error}</div>}
                {success && <div className="as-alert success">{success}</div>}

                <div className="as-grid">
                    <div className="as-input-group">
                        <label>Supplier Name *</label>
                        <div className="as-input-wrapper">
                            <BuildingOfficeIcon className="as-input-icon" />
                            <input 
                                type="text" name="supplier_name" 
                                value={formData.supplier_name} onChange={handleChange} 
                                placeholder="e.g. Acme Corp" required
                            />
                        </div>
                    </div>

                    <div className="as-input-group">
                        <label>Contact Person</label>
                        <div className="as-input-wrapper">
                            <UserPlusIcon className="as-input-icon" />
                            <input 
                                type="text" name="contact_person" 
                                value={formData.contact_person} onChange={handleChange} 
                                placeholder="Manager Name" 
                            />
                        </div>
                    </div>

                    <div className="as-input-group">
                        <label>Phone Number</label>
                        <div className="as-input-wrapper">
                            <PhoneIcon className="as-input-icon" />
                            <input 
                                type="text" name="phone" 
                                value={formData.phone} onChange={handleChange} 
                                placeholder="Phone" 
                            />
                        </div>
                    </div>

                    <div className="as-input-group">
                        <label>Email</label>
                        <div className="as-input-wrapper">
                            <EnvelopeIcon className="as-input-icon" />
                            <input 
                                type="email" name="email" 
                                value={formData.email} onChange={handleChange} 
                                placeholder="email@example.com" 
                            />
                        </div>
                    </div>

                    <div className="as-input-group">
                        <label>GST Number</label>
                        <input 
                            type="text" name="gst_number" 
                            value={formData.gst_number} onChange={handleChange} 
                            placeholder="GSTIN12345" className="as-plain-input"
                        />
                    </div>

                    <div className="as-input-group full-width">
                        <label>Address</label>
                        <div className="as-input-wrapper">
                            <MapPinIcon className="as-input-icon" />
                            <textarea 
                                name="address" rows="3"
                                value={formData.address} onChange={handleChange} 
                                placeholder="Full billing address..." 
                            />
                        </div>
                    </div>

                    <div className="as-input-group full-width checkbox-group">
                        <input 
                            type="checkbox" id="is_active" name="is_active"
                            checked={formData.is_active} onChange={handleChange} 
                        />
                        <label htmlFor="is_active">Supplier is Active</label>
                    </div>
                </div>

                <div className="as-actions">
                    <button type="submit" className="as-btn-submit">Save Supplier</button>
                </div>
            </form>
        </div>
    );
};

export default AddSupplier;