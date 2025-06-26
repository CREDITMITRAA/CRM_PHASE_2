const express = require('express')
const router = express.Router()
const LeadPartnerController = require("../controllers/LeadPartnerController")
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN } = require('../utilities/constants')
const authenticatePartner = require('../middlewares/AuthenticateLeadPartner')

router.post("/add-lead-parter", LeadPartnerController.addLeadPartner)
router.post("/upload-leads-from-lead-partner", authenticatePartner, LeadPartnerController.uploadLeadsFromLeadPartner)
router.post("/generate-headers",LeadPartnerController.generateHeaders)
router.get("/get-all-lead-partners", LeadPartnerController.getAllLeadPartners)
router.put("/:id", authenticate([ROLE_ADMIN], false), LeadPartnerController.updateLeadPartnerDetails)
router.delete('/:id', authenticate([ROLE_ADMIN]), LeadPartnerController.deleteLeadPartnerById); // Delete a user

module.exports = router