"""Independent game layouts inspired by the two Rudny pits, not survey data."""
import numpy as np

BLUEPRINTS = {
    'sarbay': dict(rx=440., ry=265., turns=1.70, benches=10, inner_phase=2.3),
    'sokolov': dict(rx=365., ry=345., turns=2.20, benches=12, inner_phase=.4),
}


def outline_factor(angle, variant):
    if variant == 'sarbay':
        return 1 + .018*np.sin(5*angle+.4) + .012*np.sin(9*angle)
    return 1 + .065*np.cos(3*angle+.5) + .025*np.sin(5*angle-1)


def baseline(points, variant):
    cfg=BLUEPRINTS[variant]
    theta=np.arctan2((points[:,1]+20)/cfg['ry'],points[:,0]/cfg['rx'])
    radius=np.hypot(points[:,0]/cfg['rx'],(points[:,1]+20)/cfg['ry'])/outline_factor(theta,variant)
    q=np.clip((radius**2-.24**2)/(1.015**2-.24**2)*cfg['benches'],0,cfg['benches'])
    level=168/cfg['benches']*(np.floor(q)+np.clip((q%1-.78)/.22,0,1))
    # Retain the established underground portal and the crusher foundation.
    smooth=lambda x:(lambda v:v*v*(3-2*v))(np.clip(x,0,1))
    old_theta=np.arctan2((points[:,1]+20)/330,points[:,0]/430)
    old_shape=1+.025*np.sin(3*old_theta+.3)+.014*np.sin(7*old_theta)+.008*np.sin(13*old_theta+1)
    old_radius=np.hypot(points[:,0]/430,(points[:,1]+20)/330)/old_shape
    old_q=np.clip((old_radius**2-.24**2)/(1.015**2-.24**2)*7,0,7)
    old=24*(np.floor(old_q)+np.clip((old_q%1-.78)/.22,0,1))
    portal=(1-smooth((np.abs(points[:,0]-40)-20)/20))*(1-smooth((np.abs(points[:,1]-112.5)-22.5)/20))
    level=level*(1-portal)+old*portal
    crusher=smooth((points[:,1]-290)/25)*(1-smooth((np.abs(points[:,0]-165)-165)/20))
    return level*(1-crusher)+168*crusher
