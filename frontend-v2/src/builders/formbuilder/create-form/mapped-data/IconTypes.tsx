import {
    Baseline,
    Cable,
    CalendarDays,
    Camera,
    CaseUpper,
    Clock,
    File,
    Hash,
    Image,
    KeyRound,
    LetterText,
    Link,
    ListCheck,
    ListChecks,
    Mail,
    Palette,
    Phone,
    ScrollText,
    Signature,
    SquareCheck,
    Star,
    Table
} from 'lucide-react';
import React from 'react';

const iconTypes = new Map<string, React.ReactNode>();

iconTypes.set('plain_text', <Baseline color="grey" size={20} strokeWidth={3} />);
iconTypes.set('multiline_text', <LetterText color="grey" size={20} strokeWidth={2.5} />);
iconTypes.set('number', <Hash size={18} color="grey" strokeWidth={3} />);
iconTypes.set('email', <Mail size={18} color="grey" strokeWidth={3} />);
iconTypes.set('phone_number', <Phone size={17} color="grey" strokeWidth={3} />);
iconTypes.set('date', <CalendarDays size={17} color="grey" strokeWidth={3} />);
iconTypes.set('password', <KeyRound size={17} color="grey" strokeWidth={3} />);
iconTypes.set('time', <Clock size={17} color="grey" strokeWidth={3} />);
iconTypes.set('url', <Link size={17} color="grey" strokeWidth={3} />);
iconTypes.set('camera', <Camera size={20} color="grey" strokeWidth={3} />);
iconTypes.set('image', <Image size={17} color="grey" strokeWidth={3} />);
iconTypes.set('file', <File size={17} color="grey" strokeWidth={3} />);
iconTypes.set('color', <Palette size={17} color="grey" strokeWidth={3} />);
iconTypes.set('rating', <Star size={17} color="grey" strokeWidth={3} />);
iconTypes.set('checkbox', <SquareCheck size={17} color="grey" strokeWidth={3} />);
iconTypes.set('single_select', <ListCheck size={20} color="grey" strokeWidth={3} />);
iconTypes.set('multi_select', <ListChecks size={20} color="grey" strokeWidth={3} />);
iconTypes.set('table', <Table size={18} color="grey" strokeWidth={3} />);
iconTypes.set('link', <Cable size={17} color="grey" strokeWidth={3} />);
iconTypes.set('signature', <Signature size={20} color="grey" strokeWidth={3} />);
iconTypes.set('multistring', <ScrollText size={17} color="grey" strokeWidth={3} />);
iconTypes.set('section_header', <CaseUpper size={22} color="grey" strokeWidth={3} />);

export default iconTypes;
