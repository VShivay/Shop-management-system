import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ArrowLeftIcon, EnvelopeIcon, PhoneIcon, MapPinIcon, 
    IdentificationIcon, CubeIcon, TrashIcon, PlusIcon, 
    PencilIcon, XMarkIcon, MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import './detail_supplier.css';

const API_URL = process.env.REACT_APP_API_URL;

// --- Skeleton Component ---
const DetailSkeleton = () => (
    <div className="ds-container">
        <div className="ds-header-skeleton shimmer"></div>
        <div className="ds-content-wrapper">
            <div className="ds-profile-card ds-skeleton-card">
                <div className="ds-avatar-skeleton shimmer"></div>
                <div className="ds-line-skeleton shimmer w-50 center"></div>
                <div className="ds-line-skeleton shimmer w-30 center mt-2"></div>
                <div className="ds-divider"></div>
                <div className="ds-grid-skeleton">
                    {[1, 2, 3, 4].map(i => <div key={i} className="ds-line-skeleton shimmer h-40"></div>)}
                </div>
            </div>
            <div className="ds-products-section ds-skeleton-card">
                <div className="ds-line-skeleton shimmer w-20 mb-4"></div>
                <div className="ds-line-skeleton shimmer h-100"></div>
            </div>
        </div>
    </div>
);

const DetailSupplier = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Modal & Linking States
    const [showModal, setShowModal] = useState(false);
    const [linkForm, setLinkForm] = useState({ product_id: '', supply_price: '' });
    
    // Search States
    const [searchTerm, setSearchTerm] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);

    // Fetch Supplier Details
    useEffect(() => {
        const fetchDetail = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`${API_URL}/suppliers/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setData(response.data.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchDetail();
    }, [id, refreshTrigger]);

    // Product Search Logic
    useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
        // Only search if term is > 1 char and no product is already selected
        if (searchTerm.trim().length > 1 && !selectedProduct) {
            setIsSearching(true);
            try {
                const token = localStorage.getItem('token');
                
                // FIXED: 
                // 1. Added '/api' prefix to match backend
                // 2. Changed param key from 'search' to 'search_name'
                const res = await axios.get(`${API_URL}/suppliers/product`, { 
                    headers: { Authorization: `Bearer ${token}` },
                    params: { 
                        search_name: searchTerm.trim(), // Matches backend searchName
                        limit: 50,                      // Match the backend's limit
                        page: 1
                    } 
                });

                setProductResults(res.data.data || []);
            } catch (err) {
                console.error("Error searching products:", err);
                setProductResults([]); // Clear results on error
            } finally {
                setIsSearching(false);
            }
        } else if (searchTerm.trim().length <= 1) {
            setProductResults([]);
        }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
}, [searchTerm, selectedProduct]);

    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
        setSelectedProduct(null); 
        setLinkForm(prev => ({ ...prev, product_id: '' }));
    };

    const selectProduct = (product) => {
        setSelectedProduct(product);
        setSearchTerm(product.product_name);
        setLinkForm(prev => ({ ...prev, product_id: product.product_id }));
        setProductResults([]);
    };

    const handleLinkProduct = async (e) => {
        e.preventDefault();
        if (!linkForm.product_id) {
            alert("Please select a valid product.");
            return;
        }

        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/suppliers/${id}/products`, linkForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setShowModal(false);
            setLinkForm({ product_id: '', supply_price: '' });
            setSearchTerm('');
            setSelectedProduct(null);
            setRefreshTrigger(prev => prev + 1); 
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to link product');
        }
    };

    const handleUnlink = async (productId) => {
        if(!window.confirm("Stop supplying this product?")) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}/suppliers/${id}/products/${productId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRefreshTrigger(prev => prev + 1);
        } catch (err) {
            alert('Failed to unlink product');
        }
    };

    if (loading) return <div className="ds-wrapper"><DetailSkeleton /></div>;
    if (!data) return null;

    return (
        <div className="ds-wrapper">
            <div className="ds-container fade-in">
                {/* Header Actions */}
                <div className="ds-header">
                    <button className="ds-btn-back" onClick={() => navigate('/dashboard/suppliers')}>
                        <ArrowLeftIcon className="ds-icon" /> Back
                    </button>
                    <div className="ds-header-title-mobile">Supplier Details</div>
                    <button className="ds-btn-edit" onClick={() => navigate(`/dashboard/suppliers/edit/${id}`)}>
                        <PencilIcon className="ds-icon" /> Edit Profile
                    </button>
                </div>

                <div className="ds-content-layout">
                    {/* Left: Profile Card */}
                    <aside className="ds-sidebar">
                        <div className="ds-card ds-profile-card">
                            <div className="ds-profile-header">
                                <div className="ds-avatar-lg">
                                    {data.supplier_name?.charAt(0).toUpperCase()}
                                </div>
                                <h2 className="ds-name">{data.supplier_name}</h2>
                                <div className={`ds-status-badge ${data.is_active ? 'active' : 'inactive'}`}>
                                    <span className="ds-dot"></span>
                                    {data.is_active ? 'Active' : 'Inactive'}
                                </div>
                            </div>
                            
                            <div className="ds-divider"></div>
                            
                            <div className="ds-info-grid">
                                <div className="ds-info-item">
                                    <div className="ds-icon-box"><IdentificationIcon /></div>
                                    <div>
                                        <label>GST Number</label>
                                        <p>{data.gst_number || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="ds-info-item">
                                    <div className="ds-icon-box"><PhoneIcon /></div>
                                    <div>
                                        <label>Phone</label>
                                        <p>{data.phone || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="ds-info-item">
                                    <div className="ds-icon-box"><EnvelopeIcon /></div>
                                    <div>
                                        <label>Email</label>
                                        <p>{data.email || 'N/A'}</p>
                                    </div>
                                </div>
                                <div className="ds-info-item">
                                    <div className="ds-icon-box"><MapPinIcon /></div>
                                    <div>
                                        <label>Address</label>
                                        <p>{data.address || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* Right: Products Table */}
                    <main className="ds-main">
                        <div className="ds-card ds-products-card">
                            <div className="ds-section-header">
                                <div className="ds-title-group">
                                    <div className="ds-icon-bg"><CubeIcon /></div>
                                    <h3>Supplied Products <span className="ds-count">{data.products?.length || 0}</span></h3>
                                </div>
                                <button className="ds-btn-add" onClick={() => setShowModal(true)}>
                                    <PlusIcon className="ds-icon-sm" /> 
                                    <span>Link Product</span>
                                </button>
                            </div>

                            <div className="ds-table-wrapper">
                                <table className="ds-table">
                                    <thead>
                                        <tr>
                                            <th>Product Name</th>
                                            <th className="text-right">Supply Price</th>
                                            <th>Last Supplied</th>
                                            <th className="text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.products?.map((prod) => (
                                            <tr key={prod.product_id}>
                                                <td className="fw-600 text-dark">{prod.product_name}</td>
                                                <td className="text-right ds-price">₹{prod.supply_price}</td>
                                                <td className="text-muted text-sm">
                                                    {prod.last_supplied_date ? new Date(prod.last_supplied_date).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="text-center">
                                                    <button className="ds-btn-icon-danger" onClick={() => handleUnlink(prod.product_id)}>
                                                        <TrashIcon className="ds-icon-xs" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {data.products?.length === 0 && (
                                            <tr>
                                                <td colSpan="4" className="ds-empty-state">
                                                    No products linked to this supplier yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </main>
                </div>

                {/* Modal */}
                {showModal && (
                    <div className="ds-modal-overlay fade-in">
                        <div className="ds-modal">
                            <div className="ds-modal-header">
                                <h3>Link New Product</h3>
                                <button onClick={() => setShowModal(false)} className="ds-btn-close">
                                    <XMarkIcon className="ds-icon-sm"/>
                                </button>
                            </div>
                            <form onSubmit={handleLinkProduct} className="ds-modal-body">
                                <div className="ds-input-group relative">
                                    <label>Search Product</label>
                                    <div className={`ds-search-box ${selectedProduct ? 'valid' : ''}`}>
                                        <MagnifyingGlassIcon className="ds-input-icon" />
                                        <input 
                                            type="text" 
                                            placeholder="Type to search..."
                                            value={searchTerm}
                                            onChange={handleSearchChange}
                                        />
                                        {isSearching && <div className="ds-loader-spinner"></div>}
                                    </div>
                                    
                                    {/* Dropdown Results */}
                                    {productResults.length > 0 && (
                                        <ul className="ds-dropdown-list">
                                            {productResults.map(p => (
                                                <li key={p.product_id} onClick={() => selectProduct(p)}>
                                                    <div className="ds-res-name">{p.product_name}</div>
                                                    <div className="ds-res-cat">{p.category_name}</div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="ds-input-group">
                                    <label>Supply Price (₹)</label>
                                    <input 
                                        type="number" step="0.01" required 
                                        value={linkForm.supply_price}
                                        onChange={(e) => setLinkForm({...linkForm, supply_price: e.target.value})}
                                        placeholder="0.00"
                                        className="ds-input-price"
                                    />
                                </div>

                                <button type="submit" className="ds-btn-confirm" disabled={!linkForm.product_id}>
                                    {linkForm.product_id ? 'Confirm Link' : 'Select Product First'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DetailSupplier;