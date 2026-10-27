import { useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext";
import { superAdminApi } from "../../services/api";
import CustomDropdown from "./CustomDropdown";
import PhoneInputField from "../../components/PhoneInputField";
import { formatFullPhone } from "../../utils/phoneUtils";
import { TAMIL_NADU_DISTRICTS } from "../data/tamilNaduDistricts";

/**
 * Shared branch form modal (create + edit) for the Super Admin dashboard.
 *
 * `editingBranch === null` → create mode (also provisions the Branch Admin
 * account, consuming one subscription seat). Otherwise updates the branch:
 * the name/city are rebuilt from the selected district.
 */
const EMPTY_BRANCH_FORM = {
  district: "",
  address: "",
  notes: "",
};

const EMPTY_ADMIN_FORM = {
  adminName: "",
  adminEmail: "",
  adminMobile: "",
  adminPassword: "",
};

const BranchFormModal = ({ open, editingBranch, onClose, onSaved }) => {
  const { showToast } = useToast();

  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH_FORM);
  const [adminPhoneCountryCode, setAdminPhoneCountryCode] = useState("+91");
  const [adminForm, setAdminForm] = useState(EMPTY_ADMIN_FORM);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormError("");
    setIsSaving(false);
    setAdminForm(EMPTY_ADMIN_FORM);
    if (editingBranch) {
      // Prefill the district when the stored city (or legacy name) matches one;
      // legacy locality branches start unselected and must pick a district.
      const knownDistrict = TAMIL_NADU_DISTRICTS.find(
        (d) =>
          d === editingBranch.city ||
          d === editingBranch.name ||
          `${d} Branch` === editingBranch.name
      );
      setBranchForm({
        district: knownDistrict || "",
        address: editingBranch.address || "",
        notes: editingBranch.notes || "",
      });
    } else {
      setBranchForm(EMPTY_BRANCH_FORM);
    }
  }, [open, editingBranch]);

  if (!open) return null;

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();

    if (!branchForm.district.trim()) {
      setFormError("Please select a district for the branch.");
      return;
    }

    if (!editingBranch) {
      if (!adminForm.adminName.trim() || !adminForm.adminEmail.trim()) {
        setFormError("Branch Admin name and email are required.");
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(adminForm.adminEmail.trim())) {
        setFormError("Branch Admin email must be a valid email address.");
        return;
      }
    }

    setIsSaving(true);
    try {
      let res;
      const district = branchForm.district.trim();
      const branchName = `${district} Branch`;
      if (editingBranch) {
        res = await superAdminApi.updateBranch(editingBranch.id, {
          name: branchName,
          city: district,
          region: "",
          address: branchForm.address,
          notes: branchForm.notes,
        });
      } else {
        const formattedMobile = adminForm.adminMobile.trim()
          ? formatFullPhone(adminPhoneCountryCode, adminForm.adminMobile.trim())
          : "";
        res = await superAdminApi.createBranch({
          name: branchName,
          city: district,
          region: "",
          address: branchForm.address,
          notes: branchForm.notes,
          ...adminForm,
          adminMobile: formattedMobile,
        });
      }

      if (res?.success) {
        showToast(
          editingBranch
            ? "Branch updated successfully."
            : res.message || "Branch created successfully.",
          "success"
        );
        onSaved?.(res.data);
        onClose();
      } else {
        setFormError(res?.message || "Failed to save branch.");
      }
    } catch (err) {
      setFormError(err.message || "Failed to save branch. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="sa-modal-overlay" onClick={onClose}>
      <div className="sa-modal sa-modal--lg" onClick={(e) => e.stopPropagation()}>
        <div className="sa-modal-header">
          <h3>{editingBranch ? "Edit Branch" : "Add New Branch"}</h3>
          <button
            type="button"
            className="sa-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <form
          id="branch-modal-form"
          onSubmit={handleCreateOrUpdate}
          className="sa-modal-body"
          style={{ padding: "20px" }}
          noValidate
        >
          <div className="sa-form-divider">Branch Details</div>

          <div className="sa-form-field">
            <label htmlFor="branch-district">Branch District *</label>
            <CustomDropdown
              value={branchForm.district}
              onChange={(e) =>
                setBranchForm({ ...branchForm, district: e.target.value })
              }
              options={TAMIL_NADU_DISTRICTS.map((d) => ({
                value: d,
                label: d,
              }))}
              placeholder="— Select District —"
              searchPlaceholder="Search district…"
              searchable
              id="branch-district"
            />
            {branchForm.district ? (
              <p className="sa-form-hint" style={{ marginTop: "-2px" }}>
                Branch will be saved as <strong>"{branchForm.district} Branch"</strong>.
              </p>
            ) : editingBranch ? (
              <p className="sa-form-hint" style={{ marginTop: "-2px", color: "#b45309" }}>
                This branch was created before district-based naming — pick its district to
                update it.
              </p>
            ) : (
              <p className="sa-form-hint" style={{ marginTop: "-2px" }}>
                Select a district — the branch name (e.g. "Dindigul Branch") and its city are
                filled automatically.
              </p>
            )}
          </div>

          <div className="sa-form-field">
            <label htmlFor="branch-address">Address</label>
            <input
              id="branch-address"
              type="text"
              placeholder="Office address (optional)"
              value={branchForm.address}
              onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
            />
          </div>

          <div className="sa-form-field">
            <label htmlFor="branch-notes">Notes</label>
            <input
              id="branch-notes"
              type="text"
              placeholder="Internal notes (optional)"
              value={branchForm.notes}
              onChange={(e) => setBranchForm({ ...branchForm, notes: e.target.value })}
            />
          </div>

          {!editingBranch && (
            <>
              <div className="sa-form-divider">Branch Admin Account</div>

              <p className="sa-form-note">
                <span aria-hidden="true">👤</span>
                A dedicated Branch Admin account is provisioned with this branch and consumes
                <strong>&nbsp;one subscription seat</strong>.
              </p>

              <div className="sa-form-field" style={{ marginTop: "14px" }}>
                <label htmlFor="branch-admin-name">Branch Admin Name *</label>
                <input
                  id="branch-admin-name"
                  type="text"
                  placeholder="e.g. Priya Sharma"
                  value={adminForm.adminName}
                  onChange={(e) => setAdminForm({ ...adminForm, adminName: e.target.value })}
                  required
                />
              </div>

              <div className="sa-form-field">
                <label htmlFor="branch-admin-email">Branch Admin Email *</label>
                <input
                  id="branch-admin-email"
                  type="email"
                  placeholder="e.g. priya@dreamcity.in"
                  value={adminForm.adminEmail}
                  onChange={(e) => setAdminForm({ ...adminForm, adminEmail: e.target.value })}
                  required
                />
              </div>

              <div className="sa-form-grid-2">
                <div className="sa-form-field">
                  <label htmlFor="branch-admin-mobile">Mobile Number</label>
                  <PhoneInputField
                    id="branch-admin-mobile"
                    name="adminMobile"
                    countryCode={adminPhoneCountryCode}
                    onCountryCodeChange={(code) => setAdminPhoneCountryCode(code)}
                    value={adminForm.adminMobile}
                    onChange={(digits) =>
                      setAdminForm({ ...adminForm, adminMobile: digits })
                    }
                    placeholder="10-digit number"
                    maxLength={10}
                  />
                </div>

                <div className="sa-form-field">
                  <label htmlFor="branch-admin-password">Password</label>
                  <input
                    id="branch-admin-password"
                    type="text"
                    placeholder="Default: Admin@123"
                    value={adminForm.adminPassword}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, adminPassword: e.target.value })
                    }
                  />
                </div>
              </div>

              <p className="sa-form-hint">
                Leave the password empty to use the default <strong>Admin@123</strong>. The Branch
                Admin logs in with this email and gains access only to their branch's projects.
              </p>
            </>
          )}
        </form>

        <div className="sa-modal-footer-stack">
          {formError && (
            <div className="sa-form-error" role="alert">
              {formError}
            </div>
          )}
          <div className="sa-modal-actions">
            <button
              type="button"
              className="sa-btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="branch-modal-form"
              className="sa-btn-primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : editingBranch ? "Save Changes" : "Create Branch"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BranchFormModal;
