import * as adminService from './admin.service.js';

export async function listAdmins(_req, res) {
  res.json({ data: await adminService.listAdmins() });
}

export async function getOverview(req, res) {
  res.json({ data: await adminService.getOverview(req.validated.query) });
}
