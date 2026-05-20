import React, { useState, useContext, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Upload, Mail, Phone, MapPin, Globe, CheckCircle,
  AlertCircle, Camera, CreditCard, ArrowRight, ArrowLeft, Briefcase,
  X, RefreshCcw, ShieldCheck, FileImage, Eye, ChevronDown
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { CompanyContext } from '../../context/CompanyContext';
import { toast } from 'react-toastify';
import { validateEmail, isValidPhone, isValidNid, isValidUrl } from '../../utils/validators';
import './CreateCompany.css';

const CATEGORIES = [
  'Electronics', 'Clothing', 'Home & Kitchen', 'Books',
  'Sports', 'Beauty', 'Toys', 'Automotive', 'Health', 'Furniture', 'Other'
];

const STEPS = [
  { id: 1, label: 'Company Info',   icon: Building2 },
  { id: 2, label: 'Contact & NID',  icon: CreditCard },
  { id: 3, label: 'Face Verify',    icon: Camera },
  { id: 4, label: 'Review',         icon: Eye },
];

// ─── Camera hook ─────────────────────────────────────────────
function useCamera() {
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const [active,   setActive] = useState(false);
  const [ready,    setReady]  = useState(false); // true once video metadata loaded
  const [error,    setError]  = useState(null);

  const start = useCallback(async () => {
    setError(null);
    setReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      setActive(true); // triggers re-render → <video> mounts → useEffect attaches stream
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera access denied. Please allow camera access in your browser settings.'
          : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
          ? 'No camera found. Please connect a camera and try again.'
          : 'Could not access camera. Please ensure your device has a working camera.';
      setError(msg);
    }
  }, []);

  // Attach stream to <video> AFTER it mounts in the DOM
  useEffect(() => {
    if (active && videoRef.current && streamRef.current) {
      const video = videoRef.current;
      video.srcObject = streamRef.current;
      video.onloadedmetadata = () => {
        video.play().catch(() => {});
        setReady(true);
      };
    }
  }, [active]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActive(false);
    setReady(false);
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return Promise.resolve(null);
    const w = video.videoWidth  || 640;
    const h = video.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    return new Promise(resolve => {
      canvas.toBlob(
        blob => resolve(blob ? new File([blob], 'face_capture.jpg', { type: 'image/jpeg' }) : null),
        'image/jpeg', 0.92
      );
    });
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, active, ready, error, start, stop, capture };
}

// ─── Component ───────────────────────────────────────────────
const CreateCompany = ({ onClose }) => {
  const { isAuthenticated } = useContext(AuthContext);
  const { createCompany, fetchMyCompanies } = useContext(CompanyContext);

  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    company_name: '', description: '', contact_email: '',
    contact_phone: '', address: '', city: '', country: '',
    nid_number: '', website: '', category: ''
  });

  const [companyLogo,    setCompanyLogo]    = useState(null);
  const [logoPreview,    setLogoPreview]    = useState(null);
  const [nidFront,       setNidFront]       = useState(null);
  const [nidFrontPrev,   setNidFrontPrev]   = useState(null);
  const [nidBack,        setNidBack]        = useState(null);
  const [nidBackPrev,    setNidBackPrev]    = useState(null);
  const [faceImage,      setFaceImage]      = useState(null);
  const [facePrev,       setFacePrev]       = useState(null);

  const camera = useCamera();

  const handleChange = e =>
    setFormData(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleImageFile = (file, setFile, setPrev) => {
    if (!file) return;
    setFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPrev(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Step validation
  const validateStep1 = () => {
    if (!formData.company_name.trim()) { toast.error('Company name is required'); return false; }
    if (!formData.category)            { toast.error('Please select a category'); return false; }
    if (!formData.description.trim())  { toast.error('Description is required'); return false; }
    if (!companyLogo)                  { toast.error('Company logo is required'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.contact_email.trim())  { toast.error('Contact email is required'); return false; }
    if (!validateEmail(formData.contact_email)) { toast.error('Please enter a valid email address'); return false; }
    if (!formData.contact_phone.trim())  { toast.error('Contact phone is required'); return false; }
    if (!isValidPhone(formData.contact_phone)) { toast.error('Phone must be a valid Bangladesh number (e.g. 01712345678)'); return false; }
    if (!formData.city.trim())           { toast.error('City is required'); return false; }
    if (!formData.country.trim())        { toast.error('Country is required'); return false; }
    if (!formData.address.trim())        { toast.error('Address is required'); return false; }
    if (!formData.nid_number.trim())     { toast.error('NID number is required'); return false; }
    if (!isValidNid(formData.nid_number)) { toast.error('NID number must be exactly 10 or 17 digits'); return false; }
    if (formData.website && formData.website.trim() && !isValidUrl(formData.website)) {
      toast.error('Website must be a valid URL (e.g. https://example.com)'); return false;
    }
    if (!nidFront)                       { toast.error('NID front image is required'); return false; }
    if (!nidBack)                        { toast.error('NID back image is required'); return false; }
    return true;
  };

  const validateStep3 = () => {
    if (!faceImage) { toast.error('Face verification photo is required'); return false; }
    return true;
  };

  const goNext = async () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3) {
      if (!validateStep3()) return;
      camera.stop();
    }
    setStep(s => s + 1);
  };

  const goBack = () => {
    if (step === 3) camera.stop();
    setStep(s => s - 1);
  };

  const handleCapturePhoto = async () => {
    const file = await camera.capture();
    if (file) {
      setFaceImage(file);
      setFacePrev(URL.createObjectURL(file));
      camera.stop();
    } else {
      toast.error('Failed to capture photo. Please try again.');
    }
  };

  const retakePhoto = () => {
    setFaceImage(null);
    setFacePrev(null);
    camera.start();
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(formData).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (companyLogo) fd.append('company_logo',    companyLogo);
      if (nidFront)    fd.append('nid_front_image',  nidFront);
      if (nidBack)     fd.append('nid_back_image',   nidBack);
      if (faceImage)   fd.append('face_image',       faceImage);

      const result = await createCompany(fd);

      if (result.success) {
        toast.success(result.message || 'Application submitted for review!');
        await fetchMyCompanies();
        onClose();
      } else {
        toast.error(result.message || 'Failed to submit application');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="cc-auth-required">
        <Briefcase size={40} />
        <p>Please login to create a company</p>
      </div>
    );
  }

  return (
    <motion.div
      className="cc-wrapper"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="cc-header">
        <div className="cc-header-title">
          <Building2 size={22} />
          <h2>Register Your Company</h2>
        </div>
        <button className="cc-close-btn" onClick={onClose}><X size={20} /></button>
      </div>

      {/* Step indicator */}
      <div className="cc-stepper">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const state = step > s.id ? 'done' : step === s.id ? 'active' : 'pending';
          return (
            <React.Fragment key={s.id}>
              <div className={`cc-step-item cc-step--${state}`}>
                <div className="cc-step-bubble">
                  {state === 'done' ? <CheckCircle size={16} /> : <Icon size={16} />}
                </div>
                <span className="cc-step-name">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`cc-step-connector ${step > s.id ? 'cc-step-connector--done' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step content */}
      <div className="cc-body">
        <AnimatePresence mode="wait">
          {/* ── STEP 1: Company Info ────────────────────────────── */}
          {step === 1 && (
            <motion.div key="step1" className="cc-step-content"
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>

              {/* Logo upload */}
              <div className="cc-logo-zone">
                <label className="cc-logo-target">
                  {logoPreview
                    ? <img src={logoPreview} alt="Logo" className="cc-logo-img" />
                    : <><Upload size={28} /><span>Upload Logo *</span></>
                  }
                  <input type="file" accept="image/*" onChange={e => handleImageFile(e.target.files[0], setCompanyLogo, setLogoPreview)} hidden />
                </label>
                {logoPreview && <button type="button" className="cc-logo-change" onClick={() => { setCompanyLogo(null); setLogoPreview(null); }}><X size={12} /> Remove</button>}
              </div>

              <div className="cc-field">
                <label>Company Name *</label>
                <input name="company_name" value={formData.company_name} onChange={handleChange}
                  placeholder="Your company name" className="cc-input" maxLength={60} required />
              </div>

              <div className="cc-field">
                <label>Category *</label>
                <div className="cc-select-wrap">
                  <select name="category" value={formData.category} onChange={handleChange} className="cc-input" required>
                    <option value="">Select a category</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={16} className="cc-select-icon" />
                </div>
              </div>

              <div className="cc-field">
                <label>Description *</label>
                <textarea name="description" value={formData.description} onChange={handleChange}
                  placeholder="Tell customers what your company offers..." className="cc-input cc-textarea"
                  rows={4} maxLength={300} required />
                <span className="cc-char-count">{formData.description.length}/300</span>
              </div>

              <div className="cc-field">
                <label>Website <span className="cc-optional">(optional)</span></label>
                <div className="cc-input-icon-wrap">
                  <Globe size={16} className="cc-input-icon" />
                  <input name="website" value={formData.website} onChange={handleChange}
                    placeholder="https://yourcompany.com" className="cc-input cc-input--icon" />
                </div>
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: Contact & NID ────────────────────────────── */}
          {step === 2 && (
            <motion.div key="step2" className="cc-step-content"
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>

              <div className="cc-row">
                <div className="cc-field">
                  <label>Contact Email *</label>
                  <div className="cc-input-icon-wrap">
                    <Mail size={16} className="cc-input-icon" />
                    <input name="contact_email" type="email" value={formData.contact_email}
                      onChange={handleChange} placeholder="company@email.com" className="cc-input cc-input--icon" required />
                  </div>
                </div>
                <div className="cc-field">
                  <label>Contact Phone *</label>
                  <div className="cc-input-icon-wrap">
                    <Phone size={16} className="cc-input-icon" />
                    <input name="contact_phone" value={formData.contact_phone}
                      onChange={handleChange} placeholder="+1 234 567 8900" className="cc-input cc-input--icon" required />
                  </div>
                </div>
              </div>

              <div className="cc-row">
                <div className="cc-field">
                  <label>City *</label>
                  <input name="city" value={formData.city} onChange={handleChange}
                    placeholder="City" className="cc-input" required />
                </div>
                <div className="cc-field">
                  <label>Country *</label>
                  <input name="country" value={formData.country} onChange={handleChange}
                    placeholder="Country" className="cc-input" required />
                </div>
              </div>

              <div className="cc-field">
                <label>Address *</label>
                <div className="cc-input-icon-wrap">
                  <MapPin size={16} className="cc-input-icon" />
                  <input name="address" value={formData.address} onChange={handleChange}
                    placeholder="Street address" className="cc-input cc-input--icon" required />
                </div>
              </div>

              {/* NID Section */}
              <div className="cc-section-divider">
                <CreditCard size={16} />
                <span>National ID Verification</span>
              </div>

              <div className="cc-field">
                <label>NID Number *</label>
                <input name="nid_number" value={formData.nid_number} onChange={handleChange}
                  placeholder="Enter your NID number" className="cc-input" required />
              </div>

              <div className="cc-nid-uploads">
                {/* NID Front */}
                <div className="cc-nid-card">
                  <label className="cc-nid-upload-area">
                    {nidFrontPrev
                      ? <img src={nidFrontPrev} alt="NID Front" />
                      : <><FileImage size={28} /><span>NID Front *</span><p>Upload front side</p></>
                    }
                    <input type="file" accept="image/*"
                      onChange={e => handleImageFile(e.target.files[0], setNidFront, setNidFrontPrev)} hidden />
                  </label>
                  {nidFrontPrev && (
                    <button type="button" className="cc-nid-remove"
                      onClick={() => { setNidFront(null); setNidFrontPrev(null); }}>
                      <X size={12} /> Remove
                    </button>
                  )}
                </div>

                {/* NID Back */}
                <div className="cc-nid-card">
                  <label className="cc-nid-upload-area">
                    {nidBackPrev
                      ? <img src={nidBackPrev} alt="NID Back" />
                      : <><FileImage size={28} /><span>NID Back *</span><p>Upload back side</p></>
                    }
                    <input type="file" accept="image/*"
                      onChange={e => handleImageFile(e.target.files[0], setNidBack, setNidBackPrev)} hidden />
                  </label>
                  {nidBackPrev && (
                    <button type="button" className="cc-nid-remove"
                      onClick={() => { setNidBack(null); setNidBackPrev(null); }}>
                      <X size={12} /> Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="cc-info-note">
                <AlertCircle size={14} />
                <span>Your NID must match our registry. False submissions result in account suspension.</span>
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: Face Verification ─────────────────────────── */}
          {step === 3 && (
            <motion.div key="step3" className="cc-step-content cc-step-content--center"
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>

              <div className="cc-face-header">
                <ShieldCheck size={32} />
                <h3>Live Face Verification</h3>
                <p>Take a live selfie to verify your identity. File uploads are not allowed for this step.</p>
              </div>

              {facePrev ? (
                /* Captured state */
                <div className="cc-face-captured">
                  <img src={facePrev} alt="Face capture" />
                  <div className="cc-face-ok">
                    <CheckCircle size={18} />
                    Photo captured successfully
                  </div>
                  <button type="button" className="cc-face-retake" onClick={retakePhoto}>
                    <RefreshCcw size={14} /> Retake Photo
                  </button>
                </div>
              ) : camera.active ? (
                /* Live camera */
                <div className="cc-camera-active">
                  <div className="cc-camera-frame">
                    <video
                      ref={camera.videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="cc-video"
                    />
                    {!camera.ready && (
                      <div className="cc-camera-loading">
                        <div className="cc-camera-spinner" />
                        <span>Starting camera…</span>
                      </div>
                    )}
                    <div className="cc-camera-overlay" />
                  </div>
                  <button
                    type="button"
                    className="cc-capture-btn"
                    onClick={handleCapturePhoto}
                    disabled={!camera.ready}
                  >
                    <Camera size={22} /> {camera.ready ? 'Capture Photo' : 'Waiting for camera…'}
                  </button>
                </div>
              ) : (
                /* Start camera */
                <div className="cc-camera-idle">
                  {camera.error && (
                    <div className="cc-camera-error">
                      <AlertCircle size={16} />
                      <span>{camera.error}</span>
                    </div>
                  )}
                  <button type="button" className="cc-start-camera-btn" onClick={camera.start}>
                    <Camera size={18} /> Open Camera
                  </button>
                  <p className="cc-camera-note">
                    Your browser will ask for camera permission. This photo is used only for identity verification.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── STEP 4: Review & Submit ────────────────────────────── */}
          {step === 4 && (
            <motion.div key="step4" className="cc-step-content"
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>

              <div className="cc-review-header">
                <Eye size={22} />
                <h3>Review Your Application</h3>
                <p>Verify everything looks correct before submitting.</p>
              </div>

              <div className="cc-review-grid">
                {/* Company info */}
                <div className="cc-review-card">
                  <div className="cc-review-card-title"><Building2 size={15} /> Company</div>
                  {logoPreview && <img src={logoPreview} alt="Logo" className="cc-review-logo" />}
                  <div className="cc-review-row"><span>Name</span><strong>{formData.company_name}</strong></div>
                  <div className="cc-review-row"><span>Category</span><strong>{formData.category}</strong></div>
                  <div className="cc-review-row"><span>Description</span><strong>{formData.description}</strong></div>
                  {formData.website && <div className="cc-review-row"><span>Website</span><strong>{formData.website}</strong></div>}
                </div>

                {/* Contact info */}
                <div className="cc-review-card">
                  <div className="cc-review-card-title"><Phone size={15} /> Contact</div>
                  <div className="cc-review-row"><span>Email</span><strong>{formData.contact_email}</strong></div>
                  <div className="cc-review-row"><span>Phone</span><strong>{formData.contact_phone}</strong></div>
                  <div className="cc-review-row"><span>City</span><strong>{formData.city}</strong></div>
                  <div className="cc-review-row"><span>Country</span><strong>{formData.country}</strong></div>
                  <div className="cc-review-row"><span>Address</span><strong>{formData.address}</strong></div>
                </div>

                {/* NID */}
                <div className="cc-review-card">
                  <div className="cc-review-card-title"><CreditCard size={15} /> Identity</div>
                  <div className="cc-review-row"><span>NID Number</span><strong>{formData.nid_number}</strong></div>
                  <div className="cc-review-images">
                    {nidFrontPrev && <div className="cc-review-img-wrap"><img src={nidFrontPrev} alt="NID Front" /><span>Front</span></div>}
                    {nidBackPrev  && <div className="cc-review-img-wrap"><img src={nidBackPrev}  alt="NID Back"  /><span>Back</span></div>}
                    {facePrev     && <div className="cc-review-img-wrap"><img src={facePrev}     alt="Face"      /><span>Face</span></div>}
                  </div>
                </div>
              </div>

              <div className="cc-review-notice">
                <ShieldCheck size={16} />
                <span>
                  Your application will be reviewed by a staff admin within 24-48 hours.
                  You'll be notified once your company is approved.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="cc-footer">
        {step > 1
          ? <button type="button" className="cc-btn cc-btn--back" onClick={goBack}>
              <ArrowLeft size={16} /> Back
            </button>
          : <div />
        }

        {step < 4
          ? <button type="button" className="cc-btn cc-btn--next" onClick={goNext}>
              Continue <ArrowRight size={16} />
            </button>
          : <button type="button" className="cc-btn cc-btn--submit" onClick={handleSubmit} disabled={loading}>
              {loading
                ? <span className="cc-spinner" />
                : <><ShieldCheck size={16} /> Submit Application</>
              }
            </button>
        }
      </div>
    </motion.div>
  );
};

export default CreateCompany;
