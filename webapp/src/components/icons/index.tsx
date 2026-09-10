import { createFaIcon, type IconProps } from './factory';
export type { IconProps };

// ── Font Awesome 7 Brands Icons ─────────────────────────────────────────────
import { faGoogle } from '@fortawesome/free-brands-svg-icons';

// ── Font Awesome 7 Classic Regular Icons ─────────────────────────────────────
import {
  faBell,
  faCalendarDays,
  faCamera,
  faCircleCheck,
  faCircleDot,
  faCircleQuestion,
  faCircleUser,
  faClock,
  faClone,
  faCloud,
  faComment,
  faCopy,
  faEnvelope,
  faEye,
  faEyeSlash,
  faFile,
  faFileCode,
  faFolder,
  faFolderOpen,
  faHandshake,
  faHardDrive,
  faHouse,
  faImage,
  faImages,
  faMoon,
  faPenToSquare,
  faSquare,
  faStar,
  faSun,
  faTrashCan,
  faUser,
  faWindowMaximize,
  faWindowMinimize,
} from '@fortawesome/free-regular-svg-icons';

// ── Font Awesome 7 Classic / Stroke Icons (where only available in solid set) ──
import {
  faChartLine,
  faCircleExclamation,
  faTriangleExclamation,
  faArrowDown,
  faArrowDownAZ,
  faArrowLeft,
  faArrowRight,
  faBan,
  faRobot,
  faCheck,
  faCheckDouble,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faAnglesLeft,
  faAnglesRight,
  faUpDown,
  faMicrochip,
  faDatabase,
  faDownload,
  faForward,
  faFilm,
  faFingerprint,
  faFire,
  faGaugeHigh,
  faGlobe,
  faTableCellsLarge,
  faGripVertical,
  faCircleInfo,
  faKey,
  faLock,
  faLayerGroup,
  faSpinner,
  faRightFromBracket,
  faExpand,
  faCompress,
  faBars,
  faPause,
  faPlay,
  faPlus,
  faSatelliteDish,
  faTowerBroadcast,
  faRotate,
  faBackward,
  faRotateLeft,
  faUpRightAndDownLeftFromCenter,
  faMagnifyingGlass,
  faServer,
  faShield,
  faShieldHalved,
  faSliders,
  faMobileScreen,
  faWandMagicSparkles,
  faTable,
  faTv,
  faUpload,
  faUserCheck,
  faUserGear,
  faUserXmark,
  faUsers,
  faVideo,
  faVideoSlash,
  faVolumeLow,
  faVolumeHigh,
  faVolumeXmark,
  faXmark,
  faBolt,
  faPowerOff,
  faQrcode,
  faFileShield,
  faDesktop,
} from '@fortawesome/free-solid-svg-icons';


// ── Exported Icon Components (Font Awesome 7 SVG suite) ──────────────────────
export const Activity = createFaIcon(faChartLine);
export const AlertCircle = createFaIcon(faCircleExclamation);
export const AlertTriangle = createFaIcon(faTriangleExclamation);
export const ArrowDown = createFaIcon(faArrowDown);
export const ArrowDownAZ = createFaIcon(faArrowDownAZ);
export const ArrowLeft = createFaIcon(faArrowLeft);
export const ArrowRight = createFaIcon(faArrowRight);
export const Ban = createFaIcon(faBan);
export const Bell = createFaIcon(faBell);
export const Bot = createFaIcon(faRobot);
export const Calendar = createFaIcon(faCalendarDays);
export const Camera = createFaIcon(faCamera);
export const Check = createFaIcon(faCheck);
export const CheckCheck = createFaIcon(faCheckDouble);
export const CheckCircle2 = createFaIcon(faCircleCheck);
export const ChevronDown = createFaIcon(faChevronDown);
export const ChevronLeft = createFaIcon(faChevronLeft);
export const ChevronRight = createFaIcon(faChevronRight);
export const ChevronUp = createFaIcon(faChevronUp);
export const ChevronsLeft = createFaIcon(faAnglesLeft);
export const ChevronsRight = createFaIcon(faAnglesRight);
export const ChevronsUpDown = createFaIcon(faUpDown);
export const Clock = createFaIcon(faClock);
export const Cloud = createFaIcon(faCloud);
export const Copy = createFaIcon(faCopy);
export const Cpu = createFaIcon(faMicrochip);
export const FileCode = createFaIcon(faFileCode);
export const FileJson = createFaIcon(faFileCode);
export const FileShield = createFaIcon(faFileShield);
export const QrCode = createFaIcon(faQrcode);
export const Database = createFaIcon(faDatabase);
export const Download = createFaIcon(faDownload);
export const Edit2 = createFaIcon(faPenToSquare);
export const Eye = createFaIcon(faEye);
export const EyeOff = createFaIcon(faEyeSlash);
export const FastForward = createFaIcon(faForward);
export const Film = createFaIcon(faFilm);
export const Fingerprint = createFaIcon(faFingerprint);
export const Flame = createFaIcon(faFire);
export const Gauge = createFaIcon(faGaugeHigh);
export const Globe = createFaIcon(faGlobe);
export const Google = createFaIcon(faGoogle);
export const Grid2X2 = createFaIcon(faTableCellsLarge);
export const GripVertical = createFaIcon(faGripVertical);
export const HardDrive = createFaIcon(faHardDrive);
export const HeartHandshake = createFaIcon(faHandshake);
export const House = createFaIcon(faHouse);
export const HomeIcon = createFaIcon(faHouse);
export const Info = createFaIcon(faCircleInfo);
export const KeyRound = createFaIcon(faKey);
export const Layers = createFaIcon(faLayerGroup);
export const LayoutGrid = createFaIcon(faTableCellsLarge);
export const Loader2 = createFaIcon(faSpinner, 'animate-spin');
export const Lock = createFaIcon(faLock);
export const LogOut = createFaIcon(faRightFromBracket);
export const Maximize = createFaIcon(faExpand);
export const Maximize2 = createFaIcon(faExpand);
export const Menu = createFaIcon(faBars);
export const Minimize = createFaIcon(faCompress);
export const Minimize2 = createFaIcon(faCompress);
export const Pause = createFaIcon(faPause);
export const Pencil = createFaIcon(faPenToSquare);
export const Play = createFaIcon(faPlay);
export const Plus = createFaIcon(faPlus);
export const Power = createFaIcon(faPowerOff);
export const PowerOff = createFaIcon(faPowerOff);
export const Radar = createFaIcon(faSatelliteDish);
export const Radio = createFaIcon(faTowerBroadcast);
export const RefreshCw = createFaIcon(faRotate);
export const Rewind = createFaIcon(faBackward);
export const RotateCcw = createFaIcon(faRotateLeft);
export const RotateCw = createFaIcon(faRotate);
export const Scaling = createFaIcon(faUpRightAndDownLeftFromCenter);
export const Search = createFaIcon(faMagnifyingGlass);
export const Server = createFaIcon(faServer);
export const Shield = createFaIcon(faShield);
export const ShieldAlert = createFaIcon(faShieldHalved);
export const ShieldCheck = createFaIcon(faShieldHalved);
export const Sliders = createFaIcon(faSliders);
export const Smartphone = createFaIcon(faMobileScreen);
export const Sparkles = createFaIcon(faWandMagicSparkles);
export const Square = createFaIcon(faSquare);
export const Star = createFaIcon(faStar);
export const Table = createFaIcon(faTable);
export const Trash2 = createFaIcon(faTrashCan);
export const Tv = createFaIcon(faTv);
export const Upload = createFaIcon(faUpload);
export const User = createFaIcon(faUser);
export const UserCheck = createFaIcon(faUserCheck);
export const UserCog = createFaIcon(faUserGear);
export const UserX = createFaIcon(faUserXmark);
export const Users = createFaIcon(faUsers);
export const Video = createFaIcon(faVideo);
export const VideoOff = createFaIcon(faVideoSlash);
export const Volume1 = createFaIcon(faVolumeLow);
export const Volume2 = createFaIcon(faVolumeHigh);
export const VolumeX = createFaIcon(faVolumeXmark);
export const X = createFaIcon(faXmark);
export const Zap = createFaIcon(faBolt);
export const Sun = createFaIcon(faSun);
export const Moon = createFaIcon(faMoon);
export const Monitor = createFaIcon(faDesktop);
export const Desktop = createFaIcon(faDesktop);
export const CircleUser = createFaIcon(faCircleUser);
export const CircleDot = createFaIcon(faCircleDot);
export const CircleQuestion = createFaIcon(faCircleQuestion);
export const Clone = createFaIcon(faClone);
export const Comment = createFaIcon(faComment);
export const Envelope = createFaIcon(faEnvelope);
export const File = createFaIcon(faFile);
export const Folder = createFaIcon(faFolder);
export const FolderOpen = createFaIcon(faFolderOpen);
export const Image = createFaIcon(faImage);
export const Images = createFaIcon(faImages);
export const WindowMaximize = createFaIcon(faWindowMaximize);
export const WindowMinimize = createFaIcon(faWindowMinimize);
