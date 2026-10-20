import { useState, useEffect, useRef } from "react";
import {
  FaSearch,
  FaPhone,
  FaEnvelope,
  FaEllipsisH,
  FaFilter,
  FaEye,
  FaEdit,
  FaTrash,
  FaTimes,
} from "react-icons/fa";

import "../styles/customers.css";
import { adminApi, superAdminApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useAdminProfile } from "../context/AdminProfileContext";

const initialCustomers = [
  {
    id: 1,
    name: "Arun Kumar",
    phone: "+91 98765 43210",
    email: "arun@example.com",
    location: "Dindigul",
    project: "Green Valley",
    visits: 2,
    status: "Interested",
  },
  {
    id: 2,
    name: "Priya S",
    phone: "+91 98765 12345",
    email: "priya@example.com",
    location: "Madurai",
    project: "Sunrise City",
    visits: 1,
    status: "Follow Up",
  },
  {
    id: 3,
    name: "Ramesh J",
    phone: "+91 98432 67890",
    email: "ramesh@example.com",
    location: "Trichy",
    project: "Lake View",
    visits: 3,
    status: "Negotiation",
  },
  {
    id: 4,
    name: "Meena K",
    phone: "+91 97890 11223",
    email: "meena@example.com",
    location: "Dindigul",
    project: "Green Valley",
    visits: 1,
    status: "New",
  },
  {
    id: 5,
    name: "Senthil V",
    phone: "+91 96543 22110",
    email: "senthil@example.com",
    location: "Coimbatore",
    project: "Sunrise City",
    visits: 2,
    status: "Booked",
  },
];

const CUSTOMER_STATUSES = ["New", "Interested", "Follow Up", "Negotiation", "Booked"];
const STORAGE_KEY = "dreamcity-customers";

const cleanPhone = (phone) => phone ? phone.replace(/[\s\-+]/g, "") : "";

const maskPhone = (phone) => {
  if (!phone) return "—";
  const str = String(phone).trim();
  if (str.length <= 4) return "****";
  const visiblePrefix = str.slice(0, 5);
  return `${visiblePrefix}*****`;
};

const maskEmail = (email) => {
  if (!email) return "—";
  const [userPart, domain] = email.split("@");
  if (!domain) return "—";
  const maskedUser = userPart.length > 2 ? `${userPart.slice(0, 2)}***` : `${userPart[0]}***`;
  return `${maskedUser}@${domain}`;
};

const Customers = () => {
  const { role, user, isAuthenticated } = useAuth();
  const { isSubscriptionExpired } = useAdminProfile();
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewDetailsId, setViewDetailsId] = useState(null);
  const [changeStatusId, setChangeStatusId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadCustomers = async () => {
      setLoading(true);
      try {
        let enquiriesRes, visitsRes;
        if (role === "SUPER_ADMIN") {
          [enquiriesRes, visitsRes] = await Promise.all([
            superAdminApi.getAllEnquiries(),
            superAdminApi.getAllSiteVisits(),
          ]);
        } else {
          [enquiriesRes, visitsRes] = await Promise.all([
            adminApi.getEnquiries(),
            adminApi.getSiteVisits(),
          ]);
        }

        const enquiriesList = enquiriesRes?.success && Array.isArray(enquiriesRes.data) ? enquiriesRes.data : [];
        const visitsList = visitsRes?.success && Array.isArray(visitsRes.data) ? visitsRes.data : [];

        const customerMap = new Map();

        // Process site visits
        visitsList.forEach((v) => {
          const key = (v.mobile || v.phone || v.fullName || "").trim();
          if (!key) return;
          if (!customerMap.has(key)) {
            customerMap.set(key, {
              id: v._id,
              name: v.fullName || "Customer",
              phone: v.mobile || "",
              email: v.email || "",
              location: v.projectId?.location || "Tamil Nadu",
              project: v.projectId?.title || "Direct Visit",
              visits: 1,
              status: v.status === "Completed" ? "Booked" : "Interested",
            });
          } else {
            const existing = customerMap.get(key);
            existing.visits += 1;
          }
        });

        // Process enquiries
        enquiriesList.forEach((e) => {
          const key = (e.mobile || e.phone || e.email || e.fullName || "").trim();
          if (!key) return;
          if (!customerMap.has(key)) {
            customerMap.set(key, {
              id: e._id,
              name: e.fullName || "Customer",
              phone: e.mobile || "",
              email: e.email || "",
              location: e.projectId?.location || "Tamil Nadu",
              project: e.projectId?.title || "Direct Enquiry",
              visits: 0,
              status: e.status === "CONTACTED" ? "Follow Up" : "New",
            });
          } else {
            const existing = customerMap.get(key);
            if (!existing.email && e.email) existing.email = e.email;
          }
        });

        if (isMounted) {
          const customerList = Array.from(customerMap.values());
          setCustomers(customerList);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(customerList));
        }
      } catch (err) {
        console.warn("[Customers] Failed to derive customers from leads:", err);
        if (isMounted) setCustomers([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCustomers();

    return () => {
      isMounted = false;
    };
  }, [role, user?._id, isAuthenticated]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-more-menu]')) {
        setSelectedId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCall = (phone) => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. Direct calling is restricted. Please contact your Super Administrator.");
      return;
    }
    if (!phone) {
      alert("Phone number is not available.");
      return;
    }
    window.location.href = `tel:${cleanPhone(phone)}`;
  };

  const handleEmail = (email) => {
    if (isSubscriptionExpired) {
      alert("Workspace subscription has expired. Direct emailing is restricted. Please contact your Super Administrator.");
      return;
    }
    if (!email) {
      alert("Email address is not available.");
      return;
    }
    window.location.href = `mailto:${email}`;
  };

  const toggleMoreMenu = (id, e) => {
    e.stopPropagation();
    setSelectedId(selectedId === id ? null : id);
  };

  const handleViewDetails = (id) => {
    setViewDetailsId(id);
    setSelectedId(null);
  };

  const handleChangeStatus = (id) => {
    setChangeStatusId(id);
    setSelectedId(null);
  };

  const handleDelete = (id) => {
    setDeleteConfirmId(id);
    setSelectedId(null);
  };

  const confirmStatusChange = (id, newStatus) => {
    setCustomers((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: newStatus } : item
      )
    );
    setChangeStatusId(null);
  };

  const confirmDelete = (id) => {
    setCustomers((prev) => prev.filter((item) => item.id !== id));
    setDeleteConfirmId(null);
  };

  const getStatusClass = (status) => status.toLowerCase().replace(" ", "-");

  const selectedCustomer = customers.find((c) => c.id === viewDetailsId);
  const changeStatusCustomer = customers.find((c) => c.id === changeStatusId);
  const deleteCustomer = customers.find((c) => c.id === deleteConfirmId);

  return (
    <div className="customers-page">
      {/* Header */}
      <div className="customers-header">
        <div>
          <span className="customers-kicker">CUSTOMER MANAGEMENT</span>
          <h1>Customers</h1>
        </div>
      </div>

      {/* Summary */}
      <div className="customers-summary">
        <div className="customer-summary-card">
          <span>Total Customers</span>
          <strong>{customers.length}</strong>
          <small>All registered customers</small>
        </div>

        <div className="customer-summary-card">
          <span>Interested</span>
          <strong>{customers.filter((c) => c.status === "Interested").length}</strong>
          <small>Active opportunities</small>
        </div>

        <div className="customer-summary-card">
          <span>Follow Ups</span>
          <strong>{customers.filter((c) => c.status === "Follow Up").length}</strong>
          <small>Need agent attention</small>
        </div>

        <div className="customer-summary-card">
          <span>Booked</span>
          <strong>{customers.filter((c) => c.status === "Booked").length}</strong>
          <small>Successful bookings</small>
        </div>
      </div>

      {/* Customer List */}
      <section className="customers-card">
        <div className="customers-toolbar">
          <div>
            <h2>All Customers</h2>
            <p>Customer profiles and their current property interests.</p>
          </div>

          <div className="customers-search">
            <FaSearch />
            <input
              type="text"
              placeholder="Search customer or project..."
            />
          </div>
        </div>

        <div className="customers-table-wrapper">
          <div className="customers-table">
            {/* Table Header */}
            <div className="customers-table-header">
              <span>Customer</span>
              <span>Location</span>
              <span>Interested Project</span>
              <span>Visits</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {/* Rows */}
            {customers.map((customer) => (
              <div className="customers-table-row" key={customer.id}>
                {/* Customer */}
                <div className="customer-profile">
                  <span className="customer-profile-avatar">
                    {customer.name
                      .split(" ")
                      .map((word) => word[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <div>
                    <strong>{customer.name}</strong>
                    <small>{isSubscriptionExpired ? maskPhone(customer.phone) : customer.phone}</small>
                  </div>
                </div>

                {/* Location */}
                <div className="customer-location">{customer.location}</div>

                {/* Project */}
                <div className="customer-project">{customer.project}</div>

                {/* Visits */}
                <div className="customer-visits">{customer.visits}</div>

                {/* Status */}
                <div>
                  <span className={`customer-status ${getStatusClass(customer.status)}`}>
                    {customer.status}
                  </span>
                </div>

                {/* Actions */}
                <div className="customer-actions">
                  <button
                    title={isSubscriptionExpired ? "Calling disabled (Subscription expired)" : `Call ${customer.name}`}
                    aria-label={`Call ${customer.name}`}
                    onClick={() => handleCall(customer.phone)}
                    disabled={isSubscriptionExpired}
                    style={isSubscriptionExpired ? { opacity: 0.4, cursor: "not-allowed", filter: "grayscale(1)" } : {}}
                  >
                    <FaPhone />
                  </button>

                  <button
                    title={isSubscriptionExpired ? "Emailing disabled (Subscription expired)" : `Email ${customer.name}`}
                    aria-label={`Email ${customer.name}`}
                    onClick={() => handleEmail(customer.email)}
                    disabled={isSubscriptionExpired}
                    style={isSubscriptionExpired ? { opacity: 0.4, cursor: "not-allowed", filter: "grayscale(1)" } : {}}
                  >
                    <FaEnvelope />
                  </button>

                  <div className="customer-more-wrapper" data-more-menu>
                    <button
                      title={`More actions for ${customer.name}`}
                      aria-label={`More actions for ${customer.name}`}
                      onClick={(e) => toggleMoreMenu(customer.id, e)}
                    >
                      <FaEllipsisH />
                    </button>

                    {selectedId === customer.id && (
                      <div className="customer-more-menu">
                        <button
                          className="more-menu-item"
                          onClick={() => handleViewDetails(customer.id)}
                        >
                          <FaEye /> View Details
                        </button>
                        <button
                          className="more-menu-item"
                          onClick={() => handleChangeStatus(customer.id)}
                        >
                          <FaEdit /> Change Status
                        </button>
                        <button
                          className="more-menu-item more-menu-item-danger"
                          onClick={() => handleDelete(customer.id)}
                        >
                          <FaTrash /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* View Details Modal */}
      {viewDetailsId && selectedCustomer && (
        <div className="customer-modal-overlay" onClick={() => setViewDetailsId(null)}>
          <div className="customer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="customer-modal-header">
              <h3>Customer Details</h3>
              <button
                className="customer-modal-close"
                onClick={() => setViewDetailsId(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="customer-modal-body">
              <div className="customer-detail-row">
                <label>Customer</label>
                <span>{selectedCustomer.name}</span>
              </div>
              <div className="customer-detail-row">
                <label>Phone</label>
                <span>{isSubscriptionExpired ? maskPhone(selectedCustomer.phone) : selectedCustomer.phone}</span>
              </div>
              <div className="customer-detail-row">
                <label>Email</label>
                <span>{isSubscriptionExpired ? maskEmail(selectedCustomer.email) : (selectedCustomer.email || "—")}</span>
              </div>
              <div className="customer-detail-row">
                <label>Location</label>
                <span>{selectedCustomer.location}</span>
              </div>
              <div className="customer-detail-row">
                <label>Interested Project</label>
                <span>{selectedCustomer.project}</span>
              </div>
              <div className="customer-detail-row">
                <label>Visits</label>
                <span>{selectedCustomer.visits}</span>
              </div>
              <div className="customer-detail-row">
                <label>Status</label>
                <span className={`customer-status ${getStatusClass(selectedCustomer.status)}`}>
                  {selectedCustomer.status}
                </span>
              </div>
            </div>
            <div className="customer-modal-footer">
              <button className="customer-btn-primary" onClick={() => setViewDetailsId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Status Modal */}
      {changeStatusId && changeStatusCustomer && (
        <div className="customer-modal-overlay" onClick={() => setChangeStatusId(null)}>
          <div className="customer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="customer-modal-header">
              <h3>Change Status</h3>
              <button
                className="customer-modal-close"
                onClick={() => setChangeStatusId(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="customer-modal-body">
              <p>Update status for <strong>{changeStatusCustomer.name}</strong></p>
              <div className="customer-status-options">
                {CUSTOMER_STATUSES.map((status) => (
                  <button
                    key={status}
                    className={`customer-status-option ${
                      status === changeStatusCustomer.status ? "active" : ""
                    }`}
                    onClick={() => confirmStatusChange(changeStatusId, status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div className="customer-modal-footer">
              <button className="customer-btn-secondary" onClick={() => setChangeStatusId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && deleteCustomer && (
        <div className="customer-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="customer-modal customer-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="customer-modal-header">
              <h3>Delete Customer</h3>
              <button
                className="customer-modal-close"
                onClick={() => setDeleteConfirmId(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="customer-modal-body">
              <p>Are you sure you want to delete this customer?</p>
              <p className="customer-delete-name"><strong>{deleteCustomer.name}</strong></p>
              <p className="customer-delete-warning">This action cannot be undone.</p>
            </div>
            <div className="customer-modal-footer">
<button className="customer-btn-secondary" onClick={() => setDeleteConfirmId(null)}>
              <FaTimes /> Cancel
            </button>
              <button
                className="customer-btn-danger"
                onClick={() => confirmDelete(deleteConfirmId)}
              >
                <FaTrash /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;