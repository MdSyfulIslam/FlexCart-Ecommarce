import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle, RefreshCw, Route, MapPin,
  Building2, ArrowRight, Truck, Clock, Plus,
  GitBranch, Activity, Navigation
} from 'lucide-react';
import deliveryService from '../../../services/deliveryService';
import './RouteManagementPanel.css';

const STATUS_OPTIONS = [
  'order_placed', 'picked_up', 'at_hub', 'in_transit', 'out_for_delivery', 'delivered'
];

const STATUS_BADGE_MAP = {
  order_placed:     'rmp-badge-gray',
  picked_up:        'rmp-badge-amber',
  at_hub:           'rmp-badge-purple',
  in_transit:       'rmp-badge-blue',
  out_for_delivery: 'rmp-badge-amber',
  delivered:        'rmp-badge-green',
};

const RouteManagementPanel = ({ userRole }) => {
  const canManageRoutes = userRole === 'super_admin';
  const canAssign = userRole === 'delivery_admin' || userRole === 'super_admin';

  const [activeTab, setActiveTab] = useState('hubs');
  const [loading, setLoading] = useState(false);
  const [hubs, setHubs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  /* Hub form */
  const [newHubName, setNewHubName] = useState('');
  const [newHubLocation, setNewHubLocation] = useState('');

  /* Route form */
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [selectedHubIds, setSelectedHubIds] = useState([]);

  /* Assignment form */
  const [assignOrderNumber, setAssignOrderNumber] = useState('');
  const [assignRouteId, setAssignRouteId] = useState('');
  const [assignVehiclePlate, setAssignVehiclePlate] = useState('');

  /* Tracking form */
  const [trackingOrderNumber, setTrackingOrderNumber] = useState('');
  const [trackingStatus, setTrackingStatus] = useState('in_transit');
  const [trackingLocation, setTrackingLocation] = useState('');
  const [timeline, setTimeline] = useState([]);

  const routeOptions = useMemo(() => routes.map(r => ({
    id: r.id, label: `${r.from_location} â†’ ${r.to_location}`
  })), [routes]);

  const loadData = async () => {
    setLoading(true); setError('');
    try {
      const [hubsRes, routesRes] = await Promise.all([
        deliveryService.getHubs(false),
        deliveryService.getRoutes(false)
      ]);
      setHubs(hubsRes.data?.data || []);
      setRoutes(routesRes.data?.data || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load data');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const showMsg = (msg) => { setMessage(msg); setError(''); setTimeout(() => setMessage(''), 4000); };
  const showErr = (msg) => { setError(msg); setMessage(''); };

  const toggleHubSelection = (hubId) => {
    setSelectedHubIds(prev => prev.includes(hubId) ? prev.filter(id => id !== hubId) : [...prev, hubId]);
  };

  const handleCreateHub = async () => {
    try {
      await deliveryService.createHub({ name: newHubName, location: newHubLocation });
      showMsg('Hub created successfully');
      setNewHubName(''); setNewHubLocation('');
      await loadData();
    } catch (e) { showErr(e.response?.data?.message || 'Failed to create hub'); }
  };

  const handleCreateRoute = async () => {
    try {
      await deliveryService.createRoute({ from_location: fromLocation, to_location: toLocation, hub_ids: selectedHubIds });
      showMsg('Route created successfully');
      setFromLocation(''); setToLocation(''); setSelectedHubIds([]);
      await loadData();
    } catch (e) { showErr(e.response?.data?.message || 'Failed to create route'); }
  };

  const handleAssignRoute = async () => {
    try {
      await deliveryService.assignRouteToOrder({ orderNumber: assignOrderNumber, routeId: Number(assignRouteId) });
      showMsg('Route assigned to order');
    } catch (e) { showErr(e.response?.data?.message || 'Failed to assign route'); }
  };

  const handleAssignVehicle = async () => {
    try {
      await deliveryService.assignVehicleToOrder({ orderNumber: assignOrderNumber, vehiclePlate: assignVehiclePlate });
      showMsg('Vehicle assigned successfully');
    } catch (e) { showErr(e.response?.data?.message || 'Failed to assign vehicle'); }
  };

  const handleLoadTimeline = async () => {
    try {
      const res = await deliveryService.getTrackingTimeline(trackingOrderNumber);
      setTimeline(res.data?.data?.timeline || []);
      if ((res.data?.data?.timeline||[]).length === 0) showMsg('No tracking events found');
    } catch (e) { showErr(e.response?.data?.message || 'Failed to load timeline'); }
  };

  const handleUpdateTracking = async () => {
    try {
      const res = await deliveryService.updateTrackingStatus({
        orderNumber: trackingOrderNumber, status: trackingStatus, location: trackingLocation
      });
      setTimeline(res.data?.data?.timeline || []);
      showMsg('Tracking status updated');
    } catch (e) { showErr(e.response?.data?.message || 'Failed to update tracking status'); }
  };

  return (
    <div className="rmp-root">

      {/* â”€â”€â”€ Page Header â”€â”€â”€ */}
      <div className="rmp-page-header">
        <div className="rmp-page-title">
          <div className="rmp-page-title-icon"><Route size={18}/></div>
          <div>
            <h2>Route Management</h2>
            <p>Configure hubs, routes, assignments and live tracking</p>
          </div>
        </div>
        <button className="rmp-btn rmp-btn-ghost rmp-btn-sm" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} style={loading ? { animation: 'dap-spin 1s linear infinite' } : {}}/> Refresh
        </button>
      </div>

      {/* â”€â”€â”€ Messages â”€â”€â”€ */}
      {message && <div className="rmp-msg rmp-msg-ok"><CheckCircle size={14}/> {message}</div>}
      {error   && <div className="rmp-msg rmp-msg-err"><AlertCircle size={14}/> {error}</div>}

      {/* â”€â”€â”€ Section Tabs â”€â”€â”€ */}
      <div className="rmp-tabs">
        <button className={`rmp-tab${activeTab==='hubs'?' active':''}`} onClick={() => setActiveTab('hubs')}>
          <Building2 size={14}/> Hubs
          {hubs.length > 0 && <span className="rmp-tab-badge">{hubs.length}</span>}
        </button>
        <button className={`rmp-tab${activeTab==='routes'?' active':''}`} onClick={() => setActiveTab('routes')}>
          <Route size={14}/> Routes
          {routes.length > 0 && <span className="rmp-tab-badge">{routes.length}</span>}
        </button>
        <button className={`rmp-tab${activeTab==='assign'?' active':''}`} onClick={() => setActiveTab('assign')}>
          <GitBranch size={14}/> Assignment
        </button>
        <button className={`rmp-tab${activeTab==='tracking'?' active':''}`} onClick={() => setActiveTab('tracking')}>
          <Activity size={14}/> Tracking
        </button>
      </div>

      {/* â•â• HUBS TAB â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'hubs' && (
        <div className="rmp-grid-2">
          {/* Hub list */}
          <div className="rmp-card">
            <div className="rmp-card-header">
              <div className="rmp-card-title">
                <div className="rmp-card-icon purple"><Building2 size={15}/></div>
                <div><h4>Existing Hubs</h4><p>{hubs.length} hubs configured</p></div>
              </div>
            </div>
            <div className="rmp-card-body">
              {hubs.length === 0
                ? <div className="rmp-empty"><Building2 size={36}/><p>No hubs yet</p></div>
                : (
                  <div className="rmp-hub-grid">
                    {hubs.map(hub => (
                      <div key={hub.id} className="rmp-hub-card">
                        <Building2 size={16} className="rmp-hub-card-icon"/>
                        <div className="rmp-hub-name">{hub.name}</div>
                        <div className="rmp-hub-loc"><MapPin size={10}/>{hub.location}</div>
                        <div className="rmp-hub-status">
                          <span className={`rmp-badge ${hub.is_active !== false ? 'rmp-badge-green' : 'rmp-badge-red'}`}>
                            {hub.is_active !== false ? 'â— Active' : 'â—‹ Inactive'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>

          {/* Create hub */}
          {canManageRoutes ? (
            <div className="rmp-card">
              <div className="rmp-card-header">
                <div className="rmp-card-title">
                  <div className="rmp-card-icon green"><Plus size={15}/></div>
                  <div><h4>Create Hub</h4><p>Add a new transfer hub</p></div>
                </div>
              </div>
              <div className="rmp-card-body">
                <div className="rmp-form-group">
                  <label className="rmp-label">Hub Name</label>
                  <input className="rmp-input" value={newHubName} onChange={e => setNewHubName(e.target.value)} placeholder="e.g. Cumilla Hub"/>
                </div>
                <div className="rmp-form-group">
                  <label className="rmp-label">Location</label>
                  <input className="rmp-input" value={newHubLocation} onChange={e => setNewHubLocation(e.target.value)} placeholder="e.g. Cumilla, Chattogram Division"/>
                </div>
                <div className="rmp-btn-row">
                  <button className="rmp-btn rmp-btn-purple" onClick={handleCreateHub} disabled={!newHubName || !newHubLocation}>
                    <Plus size={14}/> Create Hub
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rmp-card">
              <div className="rmp-card-body">
                <div className="rmp-empty">
                  <AlertCircle size={32}/><p>Hub creation requires Super Admin role</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* â•â• ROUTES TAB â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'routes' && (
        <div className="rmp-grid-2">
          {/* Route list */}
          <div className="rmp-card">
            <div className="rmp-card-header">
              <div className="rmp-card-title">
                <div className="rmp-card-icon blue"><Route size={15}/></div>
                <div><h4>Configured Routes</h4><p>{routes.length} routes defined</p></div>
              </div>
            </div>
            <div className="rmp-card-body">
              {routes.length === 0
                ? <div className="rmp-empty"><Route size={36}/><p>No routes configured</p></div>
                : (
                  <div className="rmp-route-list">
                    {routes.map(route => (
                      <div key={route.id} className="rmp-route-card">
                        <span className="rmp-route-id">#{route.id}</span>
                        <div className="rmp-route-from-to">
                          <span className="rmp-route-loc"><MapPin size={11}/> {route.from_location}</span>
                          <ArrowRight size={14} className="rmp-route-arrow"/>
                          <span className="rmp-route-loc"><MapPin size={11}/> {route.to_location}</span>
                        </div>
                        {route.hubs?.length > 0 && (
                          <div className="rmp-route-hubs">
                            {route.hubs.map(h => <span key={h.id} className="rmp-hub-chip">{h.name}</span>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </div>

          {/* Create route */}
          {canManageRoutes ? (
            <div className="rmp-card">
              <div className="rmp-card-header">
                <div className="rmp-card-title">
                  <div className="rmp-card-icon blue"><Plus size={15}/></div>
                  <div><h4>Create Route</h4><p>Define a new delivery route</p></div>
                </div>
              </div>
              <div className="rmp-card-body">
                <div className="rmp-form-row">
                  <div className="rmp-form-group">
                    <label className="rmp-label">From Location</label>
                    <input className="rmp-input" value={fromLocation} onChange={e => setFromLocation(e.target.value)} placeholder="e.g. Dhaka"/>
                  </div>
                  <div className="rmp-form-group">
                    <label className="rmp-label">To Location</label>
                    <input className="rmp-input" value={toLocation} onChange={e => setToLocation(e.target.value)} placeholder="e.g. Chattogram"/>
                  </div>
                </div>
                <div className="rmp-form-group">
                  <label className="rmp-label">Intermediate Hubs (optional)</label>
                  <div className="rmp-hub-check-grid">
                    {hubs.map(hub => (
                      <label key={hub.id} className={`rmp-hub-check-item${selectedHubIds.includes(hub.id)?' checked':''}`}
                        onClick={() => toggleHubSelection(hub.id)}>
                        <input type="checkbox" checked={selectedHubIds.includes(hub.id)} readOnly/>
                        {hub.name}
                      </label>
                    ))}
                    {hubs.length === 0 && <span style={{fontSize:12,color:'var(--text-dim)'}}>No hubs available</span>}
                  </div>
                </div>
                <div className="rmp-btn-row">
                  <button className="rmp-btn rmp-btn-blue" onClick={handleCreateRoute} disabled={!fromLocation || !toLocation}>
                    <Plus size={14}/> Create Route
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rmp-card">
              <div className="rmp-card-body">
                <div className="rmp-empty"><AlertCircle size={32}/><p>Route creation requires Super Admin</p></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* â•â• ASSIGNMENT TAB â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'assign' && (
        <div className="rmp-grid-2">
          {/* Route Assignment */}
          <div className="rmp-card">
            <div className="rmp-card-header">
              <div className="rmp-card-title">
                <div className="rmp-card-icon amber"><GitBranch size={15}/></div>
                <div><h4>Assign Route to Order</h4><p>Link a defined route to a delivery order</p></div>
              </div>
            </div>
            <div className="rmp-card-body">
              {!canAssign && (
                <div className="rmp-msg rmp-msg-err" style={{marginBottom:14}}>
                  <AlertCircle size={13}/> Requires Delivery Admin or Super Admin role
                </div>
              )}
              <div className="rmp-form-group">
                <label className="rmp-label">Order Number</label>
                <input className="rmp-input" value={assignOrderNumber} onChange={e => setAssignOrderNumber(e.target.value)} placeholder="FC-..."/>
              </div>
              <div className="rmp-form-group">
                <label className="rmp-label">Select Route</label>
                <select className="rmp-select" value={assignRouteId} onChange={e => setAssignRouteId(e.target.value)}>
                  <option value="">â€” Choose a route â€”</option>
                  {routeOptions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <div className="rmp-btn-row">
                <button className="rmp-btn rmp-btn-amber" onClick={handleAssignRoute} disabled={!canAssign || !assignOrderNumber || !assignRouteId}>
                  <GitBranch size={14}/> Assign Route
                </button>
              </div>
            </div>
          </div>

          {/* Vehicle Assignment */}
          <div className="rmp-card">
            <div className="rmp-card-header">
              <div className="rmp-card-title">
                <div className="rmp-card-icon green"><Truck size={15}/></div>
                <div><h4>Assign Vehicle</h4><p>Assign a vehicle plate to an order</p></div>
              </div>
            </div>
            <div className="rmp-card-body">
              <div className="rmp-form-group">
                <label className="rmp-label">Order Number</label>
                <input className="rmp-input" value={assignOrderNumber} onChange={e => setAssignOrderNumber(e.target.value)} placeholder="FC-..." disabled={!canAssign}/>
              </div>
              <div className="rmp-form-group">
                <label className="rmp-label">Vehicle Plate Number</label>
                <input className="rmp-input" value={assignVehiclePlate} onChange={e => setAssignVehiclePlate(e.target.value)} placeholder="e.g. DHAKA-METRO-1234" disabled={!canAssign}/>
              </div>
              <div className="rmp-btn-row">
                <button className="rmp-btn rmp-btn-green" onClick={handleAssignVehicle} disabled={!canAssign || !assignVehiclePlate}>
                  <Truck size={14}/> Assign Vehicle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* â•â• TRACKING TAB â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {activeTab === 'tracking' && (
        <div className="rmp-grid-2">
          {/* Controls */}
          <div className="rmp-card">
            <div className="rmp-card-header">
              <div className="rmp-card-title">
                <div className="rmp-card-icon pink"><Activity size={15}/></div>
                <div><h4>Live Tracking</h4><p>View or update delivery tracking status</p></div>
              </div>
            </div>
            <div className="rmp-card-body">
              <div className="rmp-form-group">
                <label className="rmp-label">Order Number</label>
                <input className="rmp-input" value={trackingOrderNumber} onChange={e => setTrackingOrderNumber(e.target.value)} placeholder="FC-..."/>
              </div>
              <hr className="rmp-divider"/>
              <div className="rmp-form-group">
                <label className="rmp-label">New Status</label>
                <select className="rmp-select" value={trackingStatus} onChange={e => setTrackingStatus(e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div className="rmp-form-group">
                <label className="rmp-label">Current Location</label>
                <input className="rmp-input" value={trackingLocation} onChange={e => setTrackingLocation(e.target.value)} placeholder="e.g. Comilla Hub"/>
              </div>
              <div className="rmp-btn-row">
                <button className="rmp-btn rmp-btn-ghost rmp-btn-sm" onClick={handleLoadTimeline} disabled={!trackingOrderNumber}>
                  <Navigation size={13}/> Load Timeline
                </button>
                <button className="rmp-btn rmp-btn-blue" onClick={handleUpdateTracking} disabled={!trackingOrderNumber || !canAssign}>
                  <Activity size={14}/> Update Tracking
                </button>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="rmp-card">
            <div className="rmp-card-header">
              <div className="rmp-card-title">
                <div className="rmp-card-icon blue"><Clock size={15}/></div>
                <div>
                  <h4>Tracking Timeline</h4>
                  <p>{timeline.length} events{trackingOrderNumber ? ` for #${trackingOrderNumber}` : ''}</p>
                </div>
              </div>
            </div>
            <div className="rmp-card-body" style={{maxHeight: 400, overflowY: 'auto'}}>
              {timeline.length === 0 ? (
                <div className="rmp-empty"><Clock size={36}/><p>No events loaded yet</p></div>
              ) : (
                <div className="rmp-timeline">
                  {timeline.map(event => (
                    <div key={event.id} className="rmp-timeline-event">
                      <div className="rmp-te-status">
                        <span className={`rmp-badge ${STATUS_BADGE_MAP[event.status] || 'rmp-badge-gray'}`}>
                          {event.status?.replace(/_/g,' ')}
                        </span>
                      </div>
                      {event.location && <div className="rmp-te-loc"><MapPin size={10}/> {event.location}</div>}
                      <div className="rmp-te-time"><Clock size={10}/> {new Date(event.event_timestamp).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default RouteManagementPanel;
