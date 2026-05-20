/**
 * Format a human-readable delivery status string.
 *
 * @param {object} order     - order row (must include assigned_branch_name,
 *                             previous_branch_name, branch_accepted_at,
 *                             order_status, current_status)
 * @param {object|null} delivery - delivery row (status, delivery_boy_name,
 *                             delivery_boy_phone, from_branch_name, rejection_reason)
 * @param {'customer'|'seller'|'admin'} viewerRole
 * @returns {string}
 */
function formatOrderDeliveryStatus(order, delivery, viewerRole = 'customer') {
  if (!order) return 'Pending';

  // ── Terminal states ───────────────────────────────────────────────────────
  if (order.order_status === 'delivered' || delivery?.status === 'delivered') {
    return 'Delivered';
  }

  if (order.order_status === 'returned' || delivery?.status === 'rejected') {
    const reason = delivery?.rejection_reason
      ? String(delivery.rejection_reason).trim()
      : '';
    return reason ? `Not Delivered – ${reason}` : 'Not Delivered / Returned';
  }

  // ── Delivery assigned to delivery boy ────────────────────────────────────
  if (delivery) {
    const fromBranch = delivery.from_branch_name
      || (delivery.from_branch_id ? `Branch ${delivery.from_branch_id}` : '');

    // Out for delivery (assigned/in_transit with a delivery boy)
    if (
      delivery.delivery_boy_name &&
      ['assigned', 'in_transit', 'out_for_delivery'].includes(delivery.status)
    ) {
      const name  = delivery.delivery_boy_name;
      const phone = delivery.delivery_boy_phone || '';
      const boyInfo = phone ? `${name} (${phone})` : name;
      return fromBranch
        ? `For Delivery from Branch ${fromBranch} \u2013 ${boyInfo}`
        : `For Delivery \u2013 ${boyInfo}`;
    }

    // Legacy in_transit without a delivery boy attached
    if (delivery.status === 'in_transit') {
      const toBranch = delivery.to_branch_name
        || (delivery.to_branch_id ? `Branch ${delivery.to_branch_id}` : '');
      if (fromBranch && toBranch && fromBranch !== toBranch) {
        return `In Shipment from ${fromBranch} to ${toBranch}`;
      }
      return 'In Shipment';
    }
  }

  // Also catch out_for_delivery via order.current_status
  if (order.current_status === 'out_for_delivery' && delivery?.delivery_boy_name) {
    const fromBranch = delivery.from_branch_name || '';
    const name  = delivery.delivery_boy_name;
    const phone = delivery.delivery_boy_phone || '';
    const boyInfo = phone ? `${name} (${phone})` : name;
    return fromBranch
      ? `For Delivery from Branch ${fromBranch} \u2013 ${boyInfo}`
      : `For Delivery \u2013 ${boyInfo}`;
  }

  // ── Branch assignment flow ────────────────────────────────────────────────
  const branchName = order.assigned_branch_name || '';
  const prevBranch = order.previous_branch_name || '';

  if (branchName) {
    if (order.branch_accepted_at) {
      // Accepted at current branch (first-time or after reassignment) → "In [Branch Name]"
      return `In ${branchName}`;
    }

    // Not yet accepted at current branch
    if (prevBranch) {
      // Being transferred from previous branch to current branch
      return `In Shipment from ${prevBranch} to ${branchName}`;
    }

    // Assigned to branch but not accepted yet — both roles stay "Pending"
    return 'Pending';
  }

  // ── Fallback to raw order_status ─────────────────────────────────────────
  if (order.order_status === 'shipped') return 'In Shipment';
  if (order.order_status === 'processing') return 'Processing';
  return 'Pending';
}

module.exports = { formatOrderDeliveryStatus };
