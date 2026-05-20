import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { FiCamera, FiSave } from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import profileService from '../../services/profileService';
import { getImageUrl } from '../../utils/helpers';
import { toast } from 'react-toastify';
import { isValidUsername, isValidPhone, isValidZip, isValidDob } from '../../utils/validators';
import './MyProfile.css';

const MyProfile = ({ onClose }) => {
  const { user, updateUser } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    username: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    zip_code: '',
    description: '',
    date_of_birth: '',
    gender: ''
  });
  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        phone: user.phone || '',
        address: user.address || '',
        city: user.city || '',
        country: user.country || '',
        zip_code: user.zip_code || '',
        description: user.description || '',
        date_of_birth: user.date_of_birth ? user.date_of_birth.split('T')[0] : '',
        gender: user.gender || ''
      });
      if (user.profile_image) {
        setImagePreview(getImageUrl(user.profile_image));
      }
    }
  }, [user]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileImage(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.username && !isValidUsername(formData.username)) {
      toast.error('Username must be 3–50 characters: letters, numbers, or underscores only');
      return;
    }
    if (formData.phone && !isValidPhone(formData.phone)) {
      toast.error('Phone must be a valid Bangladesh number (e.g. 01712345678)');
      return;
    }
    if (formData.zip_code && !isValidZip(formData.zip_code)) {
      toast.error('ZIP code must be 4–10 digits');
      return;
    }
    if (formData.date_of_birth && !isValidDob(formData.date_of_birth)) {
      toast.error('Date of birth must be a valid past date');
      return;
    }

    setLoading(true);

    try {
      const fd = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (value) fd.append(key, value);
      });
      if (profileImage) fd.append('profile_image', profileImage);

      const response = await profileService.updateProfile(fd);
      if (response.data.success) {
        updateUser(response.data.data);
        toast.success('Profile updated successfully!');
        onClose();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="my-profile-form" onSubmit={handleSubmit}>
      {/* Profile Image */}
      <div className="mp-image-section">
        <div className="mp-avatar-wrapper">
          <div className="mp-avatar">
            {imagePreview ? (
              <img src={imagePreview} alt="Profile" />
            ) : (
              <span>{user?.username?.[0]?.toUpperCase() || 'U'}</span>
            )}
          </div>
          <label className="mp-camera-btn">
            <FiCamera size={16} />
            <input type="file" accept="image/*" onChange={handleImageChange} hidden />
          </label>
        </div>
        <p className="mp-image-hint">Click camera to change photo</p>
      </div>

      {/* Form Fields */}
      <div className="mp-fields">
        <div className="mp-row">
          <div className="mp-field">
            <label>Full Name</label>
            <input name="username" value={formData.username} onChange={handleChange}
              placeholder="Your name" className="form-input" />
          </div>
          <div className="mp-field">
            <label>Phone</label>
            <input name="phone" value={formData.phone} onChange={handleChange}
              placeholder="Phone number" className="form-input" />
          </div>
        </div>

        <div className="mp-field">
          <label>Description</label>
          <textarea name="description" value={formData.description} onChange={handleChange}
            placeholder="Tell us about yourself..." className="form-input" rows="3" />
        </div>

        <div className="mp-row">
          <div className="mp-field">
            <label>Address</label>
            <input name="address" value={formData.address} onChange={handleChange}
              placeholder="Street address" className="form-input" />
          </div>
          <div className="mp-field">
            <label>City</label>
            <input name="city" value={formData.city} onChange={handleChange}
              placeholder="City" className="form-input" />
          </div>
        </div>

        <div className="mp-row">
          <div className="mp-field">
            <label>Country</label>
            <input name="country" value={formData.country} onChange={handleChange}
              placeholder="Country" className="form-input" />
          </div>
          <div className="mp-field">
            <label>ZIP Code</label>
            <input name="zip_code" value={formData.zip_code} onChange={handleChange}
              placeholder="ZIP code" className="form-input" />
          </div>
        </div>

        <div className="mp-row">
          <div className="mp-field">
            <label>Date of Birth</label>
            <input name="date_of_birth" type="date" value={formData.date_of_birth}
              onChange={handleChange} className="form-input" />
          </div>
          <div className="mp-field">
            <label>Gender</label>
            <select name="gender" value={formData.gender} onChange={handleChange} className="form-input">
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Submit */}
      <motion.button
        type="submit"
        className="mp-save-btn"
        disabled={loading}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {loading ? 'Saving...' : <><FiSave size={16} /> Save Changes</>}
      </motion.button>
    </form>
  );
};

export default MyProfile;