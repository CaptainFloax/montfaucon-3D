// Point d'entrée unique vers three.js.
//
// On passe par ce module plutôt que par une importmap : une importmap est un
// script inline dans la page, donc incompatible avec un Content-Security-Policy
// strict (`script-src 'self'`). Le détour coûte un fichier et fait disparaître
// le dernier script inline du projet.
export * from '../../vendor/three.module.js';
